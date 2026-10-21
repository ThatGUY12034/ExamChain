const fs = require("fs");
const path = require("path");
const { ethers, artifacts } = require("hardhat");

// Hardhat's default accounts are mapped to demo roles.
const ROLES = require("./roles");

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
