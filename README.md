# ExamChain – Blockchain-Based Exam Paper Leak Prevention

A decentralized application (DApp) that prevents question paper leaks using
**encryption, a time-locked smart contract, multi-authority approval and an
immutable audit trail** on the Ethereum blockchain.

## Tech stack
| Layer | Technology |
|---|---|
| Smart contract | Solidity 0.8.24 |
| Blockchain (local) | Hardhat Network (Ethereum, chain id 31337) |
| Testing | Hardhat + Mocha + Chai (9 test cases) |
| Frontend | HTML, CSS, JavaScript, ethers.js v6 |
| Cryptography | AES-256-GCM (encryption), SHA-256 (integrity), Keccak-256 (key commitment) |
| Wallet (optional) | MetaMask |

## How to run (needs Node.js 18+)

Open **3 terminals** inside the `ExamChain` folder.

```bash
npm install
```

**Terminal 1 – start the local blockchain** (keep it running):
```bash
npm run node
```

**Terminal 2 – deploy the smart contract and set up demo roles:**
```bash
npm run deploy
```

**Terminal 3 – start the dashboard:**
```bash
npm start
```
Open **http://localhost:3000**.

Run the tests:
```bash
npm test
```

> Restarting `npm run node` resets the blockchain. Run `npm run deploy` again and reload the page.

## Demo script (for viva / presentation)

Use the **"Acting as"** dropdown (top right) to switch between users. Each one is a different blockchain wallet.

1. **Admin** → *Admin* tab → schedule exam with **+2 min** unlock time.
2. **Paper Setter** → *Paper Setter* tab → choose any PDF → **Encrypt & upload**.
   Download the `.enc` file and the secret key.
3. Still as Setter → try **Release key** → ❌ *"Exam has not started yet"* (time-lock works).
4. **Exam Center – Mumbai** → *Exam Center* tab → load the `.enc` file → **Verify & log receipt** ✅.
   Try a random file → ❌ hash mismatch.
5. **Authority 1** → *Authorities* tab → **Approve**. Then **Authority 2** → **Approve** (2-of-3).
6. Wait until the exam time, or click **⏩ Fast-forward 5 min** (demo only).
7. **Paper Setter** → **Release key** ✅.
8. **Exam Center – Pune** → *Decrypt & verify* with the `.enc` file → ✅ AUTHENTIC + PDF preview.
9. Leak demo: schedule a 2nd exam, upload a paper, then as **Public / Whistleblower** → *Leak Check* →
   upload the same PDF → 🚨 **LEAK PROVEN**, exam marked *Compromised*.
10. *Audit Log* tab → show every action with time, block number and wallet. Nobody can change it.

Bonus: as *Public / Whistleblower* try approving or scheduling → the contract rejects it (role-based access).

## Project structure
```
contracts/ExamChain.sol   Smart contract
test/ExamChain.test.js    Unit tests
scripts/deploy.js         Deploys contract, assigns roles, writes frontend/config.js
frontend/                 Web dashboard (index.html, app.js, style.css)
server.js                 Small static web server (port 3000)
docs/REPORT.md            Report + PPT content
```

## Using MetaMask (optional)
Add network: RPC `http://127.0.0.1:8545`, Chain ID `31337`, symbol `ETH`.
Import one of the private keys printed by `npm run node` (test keys only, never use them on a real network),
then click **Use MetaMask**.
