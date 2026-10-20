const fs = require("fs");
const path = require("path");
const { ethers, artifacts } = require("hardhat");

// Hardhat's default accounts are mapped to demo roles.
const ROLES = [
  { index: 0, role: "ADMIN", label: "Admin - University Exam Controller" },
  { index: 1, role: "SETTER", label: "Paper Setter - Prof. Mehta" },
  { index: 2, role: "AUTHORITY", label: "Authority 1 - Controller of Exams" },
  { index: 3, role: "AUTHORITY", label: "Authority 2 - Dean Academics" },
  { index: 4, role: "AUTHORITY", label: "Authority 3 - Vice Chancellor" },
  { index: 5, role: "CENTER", label: "Exam Center - Mumbai" },
  { index: 6, role: "CENTER", label: "Exam Center - Pune" },
  { index: 7, role: "PUBLIC", label: "Public / Whistleblower" },
];

async function main() {
  const signers = await ethers.getSigners();
  const chain = await ethers.deployContract("ExamChain");
  await chain.waitForDeployment();
  const address = await chain.getAddress();
  console.log("ExamChain deployed to:", address);

  const accounts = [];
  for (const r of ROLES) {
    const addr = signers[r.index].address;
    if (r.role === "SETTER") await (await chain.addSetter(addr)).wait();
    if (r.role === "AUTHORITY") await (await chain.addAuthority(addr)).wait();
    if (r.role === "CENTER") await (await chain.addCenter(addr)).wait();
    accounts.push({ ...r, address: addr });
    console.log(`  ${r.label.padEnd(40)} ${addr}`);
  }

  const { abi } = await artifacts.readArtifact("ExamChain");
  const config = { address, abi, accounts, rpcUrl: "http://127.0.0.1:8545" };
  const out = path.join(__dirname, "..", "frontend", "config.js");
  fs.writeFileSync(out, "window.EXAMCHAIN = " + JSON.stringify(config, null, 2) + ";\n");
  console.log("Frontend config written to frontend/config.js");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
