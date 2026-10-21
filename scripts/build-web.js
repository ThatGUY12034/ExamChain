// Writes frontend/contract.js (ABI + bytecode + demo roles) so the dashboard can
// deploy ExamChain to an in-browser blockchain. Run after `hardhat compile`.
const fs = require("fs");
const path = require("path");
const ROLES = require("./roles");

const artifact = require("../artifacts/contracts/ExamChain.sol/ExamChain.json");
const data = { abi: artifact.abi, bytecode: artifact.bytecode, roles: ROLES };
const out = path.join(__dirname, "..", "frontend", "contract.js");
fs.writeFileSync(out, "window.EXAMCHAIN_ARTIFACT = " + JSON.stringify(data) + ";\n");
console.log("Wrote frontend/contract.js");
