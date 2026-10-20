# ExamChain: Blockchain-Based Exam Paper Leak Prevention System

**Subject:** Blockchain Technology · **Semester:** VII · **Branch:** Computer Engineering
**Submitted by:** _<Your Name>_ (_<Roll No.>_) · **Guide:** _<Professor Name>_

---

## 1. Abstract
Question paper leaks have repeatedly led to cancelled exams, re-tests and loss of trust in
examination bodies. In the traditional system a paper is printed or emailed days in advance,
passes through many hands, and there is no reliable record of who accessed it. **ExamChain**
is a decentralized application built on Ethereum that stores the paper only in encrypted
form, locks its decryption key behind a smart contract that opens only at the exam start time
and only after approval by multiple authorities, and records every action in a tamper-proof
audit trail. If a paper leaks anyway, anyone can prove it on-chain by matching its
cryptographic hash, and the logs show exactly who had access.

## 2. Introduction
Blockchain is a distributed, append-only ledger where data, once written, cannot be modified.
Smart contracts are programs stored on the blockchain that execute automatically when their
rules are met. These two properties, **immutability** and **trustless rule enforcement**, fit a
problem where the main weakness is human trust.

## 3. Problem Statement
- Papers travel through setters, printers, couriers and centers before the exam, and any one of them can leak it.
- There is no tamper-proof log of who accessed the paper and when.
- A single official can open or distribute the paper early.
- When a "leaked paper" circulates on social media, it is hard to quickly prove whether it is genuine.

## 4. Objectives
1. Keep the question paper encrypted until the exact exam start time.
2. Ensure no single person can unlock the paper (multi-authority approval).
3. Maintain an immutable, timestamped audit log of every access.
4. Let exam centers verify that the paper they received is authentic and untampered.
5. Provide a public way to prove a leak cryptographically.

## 5. Existing System vs Proposed System
| Existing system | ExamChain |
|---|---|
| Paper printed/emailed in plain form | Paper encrypted with AES-256 in the setter's browser |
| One official controls access | 2-of-3 authorities must approve the release |
| Paper usable as soon as received | Key released only after the exam start time (smart contract time-lock) |
| Logs in a central database that can be edited | Logs are blockchain events and cannot be changed |
| Leak authenticity is hard to prove | Leaked file's SHA-256 is compared with the on-chain hash |

## 6. System Architecture
```
 ┌──────────────┐  encrypt (AES-256-GCM)  ┌───────────────────────────────┐
 │ Paper Setter │ ──────────────────────▶ │  ExamChain Smart Contract     │
 │  (browser)   │  paperHash, encHash,    │  (Ethereum / Hardhat network) │
 └──────┬───────┘  keyCommitment          │                               │
        │ .enc file (off-chain)           │  • Roles (Admin/Setter/       │
        ▼                                 │    Authority/Center)          │
 ┌──────────────┐  logDownload()          │  • Time-lock on key release   │
 │ Exam Centers │ ──────────────────────▶ │  • 2-of-3 approvals           │
 │              │ ◀────────────────────── │  • Key commitment check       │
 └──────────────┘  revealedKey (at T)     │  • Leak proof                 │
 ┌──────────────┐  approveRelease()       │  • Events = audit trail       │
 │ Authorities  │ ──────────────────────▶ │                               │
 └──────────────┘                         └───────────────────────────────┘
 ┌──────────────┐  reportLeak(hash)                   ▲
 │ Public       │ ────────────────────────────────────┘
 └──────────────┘
```
Only **hashes and the key commitment** are stored on-chain. The encrypted file is distributed
off-chain (email/USB/cloud). It is safe to share because it cannot be read without the key.

## 7. Modules
1. **Admin module:** grant roles, schedule exams with an unlock time, cancel exams.
2. **Paper Setter module:** encrypt the paper in the browser, commit hashes and the key commitment, release the key at exam time.
3. **Authority module:** approve release (multi-signature style, 2 of 3).
4. **Exam Center module:** verify the encrypted file, log receipt, decrypt at exam time, verify authenticity.
5. **Leak Check module:** anyone can upload a suspected leaked copy and prove the leak.
6. **Audit module:** displays every blockchain event with timestamp, block number and wallet.

## 8. Working / Algorithm
1. Admin calls `scheduleExam(subject, setter, unlockTime)`.
2. Setter selects the PDF. The browser generates a random 256-bit key **K** and IV, and computes:
   - `paperHash = SHA256(paper)`
   - `encFile = IV ‖ AES-GCM(K, paper)`, `encHash = SHA256(encFile)`
   - `commitment = Keccak256(K)`
3. Setter calls `uploadPaper(id, paperHash, encHash, commitment)`. It cannot be changed afterwards.
4. Centers receive `encFile`, check `SHA256(encFile) == encHash`, and call `logDownload(id)`.
5. Authorities call `approveRelease(id)`, and two approvals are needed.
6. At exam time, the setter calls `releaseKey(id, K)`. The contract checks:
   `block.timestamp ≥ unlockTime` ∧ `approvals ≥ 2` ∧ `Keccak256(K) == commitment`.
7. Centers read **K** from the chain, decrypt, check `SHA256(paper) == paperHash`, and call `recordVerification`.
8. Leak: anyone calls `reportLeak(id, SHA256(file))`. If it matches before release, status becomes **Compromised**.

**Commit–reveal scheme:** Committing to `Keccak256(K)` before the exam ensures that the key revealed
later is the same one used to encrypt. A fake or wrong key is rejected by the contract.

## 9. Smart Contract Functions
| Function | Who | Purpose |
|---|---|---|
| `addSetter / addAuthority / addCenter` | Admin | Role-based access control |
| `scheduleExam` | Admin | Create exam with unlock time |
| `uploadPaper` | Assigned setter | Commit hashes + key commitment (once only) |
| `logDownload` | Center | Record receipt of encrypted paper |
| `approveRelease` | Authority | One approval per authority |
| `releaseKey` | Setter | Time-locked, approval-gated, commitment-checked |
| `recordVerification` | Center | Record authenticity check result |
| `reportLeak` | Anyone | Prove a leak by hash match |
| `cancelExam` | Admin | Cancel compromised exam |

Events: `RoleGranted, ExamScheduled, PaperUploaded, PaperDownloaded, ReleaseApproved, KeyReleased, PaperVerified, LeakReported, ExamCancelled`.

## 10. Security Analysis
| Threat | Mitigation |
|---|---|
| Paper intercepted in transit | Only the AES-256 encrypted file is shared |
| Early opening by an insider | Smart contract rejects key release before `unlockTime` |
| A single corrupt official | 2-of-3 authority approvals needed |
| Fake key / swapped paper | Key commitment check + on-chain SHA-256 of paper |
| Tampering with logs | Blockchain events are immutable |
| Denying a leak happened | Hash-match leak proof is permanent and timestamped |
| Unauthorized user calls | Role checks in every function (`require`) |

## 11. Implementation
- **Tools:** Node.js, Hardhat, Solidity 0.8.24, ethers.js v6, Web Crypto API, VS Code.
- The local Hardhat network simulates Ethereum with 20 funded test accounts. 8 are mapped to demo roles.
- The web dashboard lets the user switch between accounts to demonstrate each role.

## 12. Testing & Results
| # | Test case | Expected | Result |
|---|---|---|---|
| 1 | Non-admin grants role / schedules exam | Rejected | ✅ Pass |
| 2 | Non-setter uploads; setter uploads twice | Rejected | ✅ Pass |
| 3 | Key release before exam time | Rejected | ✅ Pass |
| 4 | Key release with only 1 approval | Rejected | ✅ Pass |
| 5 | Key release with wrong key | Rejected | ✅ Pass |
| 6 | Double approval / outsider approval | Rejected | ✅ Pass |
| 7 | Release at exam time with 2 approvals | Key published | ✅ Pass |
| 8 | Download logging + authenticity check | Events emitted | ✅ Pass |
| 9 | Leaked copy matches hash | Exam compromised | ✅ Pass |

_(Insert screenshots: Dashboard, Setter upload, Early release rejected, Approvals, Decrypt ✅ AUTHENTIC, Leak proven, Audit log, Terminal test output.)_

## 13. Advantages
- No single point of trust or failure.
- Transparent and verifiable by anyone.
- The paper stays unreadable until the exact exam time.
- Authenticity of the paper is guaranteed at every center.
- Fast, cryptographic proof of leaks.

## 14. Limitations
- The key is revealed by a human (the setter) at exam time. A fully automatic time-lock needs advanced cryptography.
- The setter who writes the paper can still leak it outside the system. The audit trail and hash proof help identify this, but cannot prevent it.
- Leak proof needs an exact copy. A photo or retyped version will have a different hash.
- Gas costs on a public network (solved by using a permissioned or L2 chain).

## 15. Future Scope
- **Threshold encryption / Shamir's Secret Sharing:** split the key among authorities so it is reconstructed automatically at exam time.
- **Time-lock encryption (drand / tlock):** the key becomes decryptable at a specific time without anyone revealing it.
- Store encrypted papers on **IPFS**.
- Deploy on a permissioned chain (Hyperledger Besu) or a Layer-2 such as Polygon.
- Perceptual hashing / watermarking to detect leaks from photos.
- Per-center watermarked copies to trace exactly which center leaked.

## 16. Conclusion
ExamChain shows how blockchain's immutability and smart-contract automation can remove blind
trust from the examination process. The paper remains encrypted until the exam starts, no single
person can unlock it, every access is permanently recorded, and leaks can be proven
cryptographically. This makes the examination system more secure, transparent and accountable.

## 17. References
1. S. Nakamoto, "Bitcoin: A Peer-to-Peer Electronic Cash System," 2008.
2. G. Wood, "Ethereum: A Secure Decentralised Generalised Transaction Ledger" (Yellow Paper).
3. Solidity Documentation – https://docs.soliditylang.org
4. Hardhat Documentation – https://hardhat.org/docs
5. ethers.js v6 Documentation – https://docs.ethers.org/v6
6. NIST FIPS 197 (AES) and FIPS 180-4 (SHA-256).

---

# PPT Outline (12 slides)
1. **Title:** ExamChain, with your name, roll no., guide.
2. **Problem:** news headlines about paper leaks, and how papers leak today.
3. **Objectives:** the 5 objectives above.
4. **Why blockchain?** Immutability, smart contracts, decentralization.
5. **Existing vs proposed:** the comparison table.
6. **Architecture:** the diagram from section 6.
7. **Workflow:** 8 steps (schedule → encrypt → distribute → approve → time-lock → release → verify → audit).
8. **Smart contract:** functions table + the `releaseKey` code snippet with its 3 `require` checks.
9. **Security analysis:** threat vs mitigation table.
10. **Demo / screenshots:** dashboard, rejection, authentic, leak proven, audit log.
11. **Results:** 9/9 test cases passed.
12. **Limitations, future scope & conclusion.**

---

# Likely Viva Questions
- **Why not store the whole paper on the blockchain?** Storage is expensive and the blockchain is public, so anyone could read it. We store only hashes, and the encrypted file is kept off-chain.
- **What is a hash, and why SHA-256?** It is a one-way, fixed-size fingerprint. Any change to the file changes the hash completely, and it cannot be reversed.
- **What is the key commitment?** `Keccak256(key)` is stored at upload time. At release the contract re-hashes the submitted key and compares, so the key cannot be swapped (commit–reveal scheme).
- **How does the time-lock work?** `require(block.timestamp >= unlockTime)`. The contract refuses the transaction before the exam time.
- **Why AES-GCM?** It provides both confidentiality and integrity (authenticated encryption).
- **What is gas?** The fee paid to execute transactions on Ethereum. Locally, Hardhat provides free test ETH.
- **Why 2-of-3 approvals?** It removes the single point of trust, and the system still works if one authority is unavailable.
- **What happens if the setter leaks the paper?** The leak can be proven on-chain, and the audit trail shows who had access. Future scope: threshold encryption.
- **What are events in Solidity?** Logs stored in transaction receipts. They are cheap, permanent and searchable, and they form our audit trail.
- **Public vs private blockchain for this?** A permissioned chain such as Hyperledger Besu suits a university. The logic stays the same.
