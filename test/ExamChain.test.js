const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("ExamChain", function () {
  const KEY = ethers.hexlify(ethers.randomBytes(32));
  const COMMITMENT = ethers.keccak256(KEY);
  const PAPER_HASH = ethers.sha256(ethers.toUtf8Bytes("Q1. Explain proof of work."));
  const ENC_HASH = ethers.sha256(ethers.toUtf8Bytes("encrypted-bytes"));

  let chain, admin, setter, auth1, auth2, auth3, center, outsider, unlockTime;

  beforeEach(async function () {
    [admin, setter, auth1, auth2, auth3, center, outsider] = await ethers.getSigners();
    chain = await ethers.deployContract("ExamChain");

    await chain.addSetter(setter.address);
    await chain.addAuthority(auth1.address);
    await chain.addAuthority(auth2.address);
    await chain.addAuthority(auth3.address);
    await chain.addCenter(center.address);

    unlockTime = (await time.latest()) + 3600;
    await chain.scheduleExam("Blockchain Technology", setter.address, unlockTime);
  });

  async function upload() {
    await chain.connect(setter).uploadPaper(1, PAPER_HASH, ENC_HASH, COMMITMENT, "paper.pdf");
  }

  async function approveTwice() {
    await chain.connect(auth1).approveRelease(1);
    await chain.connect(auth2).approveRelease(1);
  }

  it("only admin can grant roles and schedule exams", async function () {
    await expect(chain.connect(outsider).addCenter(outsider.address)).to.be.revertedWith("Only admin");
    await expect(
      chain.connect(outsider).scheduleExam("X", setter.address, unlockTime)
    ).to.be.revertedWith("Only admin");
  });

  it("only the assigned setter can upload, and only once", async function () {
    await expect(
      chain.connect(outsider).uploadPaper(1, PAPER_HASH, ENC_HASH, COMMITMENT, "p.pdf")
    ).to.be.revertedWith("Only assigned setter");

    await upload();
    const exam = await chain.getExam(1);
    expect(exam.paperHash).to.equal(PAPER_HASH);
    expect(exam.status).to.equal(1); // Uploaded

    await expect(upload()).to.be.revertedWith("Paper already uploaded");
  });

  it("blocks key release before exam time even with approvals", async function () {
    await upload();
    await approveTwice();
    await expect(chain.connect(setter).releaseKey(1, KEY)).to.be.revertedWith("Exam has not started yet");
  });

  it("blocks key release without 2 approvals", async function () {
    await upload();
    await chain.connect(auth1).approveRelease(1);
    await time.increaseTo(unlockTime);
    await expect(chain.connect(setter).releaseKey(1, KEY)).to.be.revertedWith("Not enough approvals");
  });

  it("rejects a key that does not match the commitment", async function () {
    await upload();
    await approveTwice();
    await time.increaseTo(unlockTime);
    const fakeKey = ethers.hexlify(ethers.randomBytes(32));
    await expect(chain.connect(setter).releaseKey(1, fakeKey)).to.be.revertedWith(
      "Key does not match commitment"
    );
  });

  it("prevents double approval and non-authority approval", async function () {
    await upload();
    await chain.connect(auth1).approveRelease(1);
    await expect(chain.connect(auth1).approveRelease(1)).to.be.revertedWith("Already approved");
    await expect(chain.connect(outsider).approveRelease(1)).to.be.revertedWith("Only exam authority");
  });

  it("releases the key at exam time with 2-of-3 approvals", async function () {
    await upload();
    await approveTwice();
    await time.increaseTo(unlockTime);
    await expect(chain.connect(setter).releaseKey(1, KEY)).to.emit(chain, "KeyReleased");

    const exam = await chain.getExam(1);
    expect(exam.revealedKey).to.equal(KEY);
    expect(exam.status).to.equal(2); // Released
  });

  it("logs downloads and verification results for centers", async function () {
    await upload();
    await expect(chain.connect(outsider).logDownload(1)).to.be.revertedWith("Only exam center");
    await expect(chain.connect(center).logDownload(1)).to.emit(chain, "PaperDownloaded");
    expect(await chain.hasDownloaded(1, center.address)).to.equal(true);

    await approveTwice();
    await time.increaseTo(unlockTime);
    await chain.connect(setter).releaseKey(1, KEY);

    await expect(chain.connect(center).recordVerification(1, PAPER_HASH))
      .to.emit(chain, "PaperVerified")
      .withArgs(1, center.address, true);
    await expect(chain.connect(center).recordVerification(1, ENC_HASH))
      .to.emit(chain, "PaperVerified")
      .withArgs(1, center.address, false);
  });

  it("proves a leak on-chain when a leaked copy matches the paper hash", async function () {
    await upload();

    await chain.connect(outsider).reportLeak(1, ENC_HASH);
    expect((await chain.getExam(1)).status).to.equal(1); // still Uploaded

    await expect(chain.connect(outsider).reportLeak(1, PAPER_HASH))
      .to.emit(chain, "LeakReported");
    expect((await chain.getExam(1)).status).to.equal(3); // Compromised

    await expect(chain.connect(auth1).approveRelease(1)).to.be.revertedWith("Paper not in uploaded state");
    await time.increaseTo(unlockTime);
    await expect(chain.connect(setter).releaseKey(1, KEY)).to.be.revertedWith("Paper not in uploaded state");
  });
});
