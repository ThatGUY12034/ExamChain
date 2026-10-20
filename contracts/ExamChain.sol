// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ExamChain - Blockchain-based exam paper leak prevention
/// @notice The question paper is encrypted off-chain (AES-256-GCM in the browser).
///         Only hashes and a commitment to the key are stored on-chain. The key can
///         be revealed only after the exam start time AND after 2-of-N exam
///         authorities approve. Every action is permanently logged as an event.
contract ExamChain {
    enum Status { Scheduled, Uploaded, Released, Compromised, Cancelled }

    struct Exam {
        string subject;
        address setter;
        uint256 unlockTime;     // exam start time (unix seconds)
        bytes32 paperHash;      // SHA-256 of the original (plain) paper
        bytes32 encryptedHash;  // SHA-256 of the encrypted .enc file
        bytes32 keyCommitment;  // keccak256 of the AES key
        bytes32 revealedKey;    // AES key, filled only after release
        string fileName;
        uint8 approvals;
        Status status;
    }

    uint8 public constant REQUIRED_APPROVALS = 2;

    address public admin;
    uint256 public examCount;

    mapping(address => bool) public isSetter;
    mapping(address => bool) public isAuthority;
    mapping(address => bool) public isCenter;

    mapping(uint256 => Exam) private exams;
    mapping(uint256 => mapping(address => bool)) public hasApproved;
    mapping(uint256 => mapping(address => bool)) public hasDownloaded;

    event RoleGranted(string role, address indexed account);
    event ExamScheduled(uint256 indexed examId, string subject, address indexed setter, uint256 unlockTime);
    event PaperUploaded(uint256 indexed examId, address indexed setter, bytes32 paperHash, bytes32 encryptedHash, string fileName);
    event PaperDownloaded(uint256 indexed examId, address indexed center, uint256 timestamp);
    event ReleaseApproved(uint256 indexed examId, address indexed authority, uint8 approvals);
    event KeyReleased(uint256 indexed examId, address indexed releasedBy, uint256 timestamp);
    event PaperVerified(uint256 indexed examId, address indexed center, bool authentic);
    event LeakReported(uint256 indexed examId, address indexed reporter, bool confirmed, uint256 timestamp);
    event ExamCancelled(uint256 indexed examId);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    modifier onlyCenter() {
        require(isCenter[msg.sender], "Only exam center");
        _;
    }

    modifier examExists(uint256 examId) {
        require(examId > 0 && examId <= examCount, "Exam does not exist");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    // ---------------------------------------------------------------- roles

    function addSetter(address account) external onlyAdmin {
        isSetter[account] = true;
        emit RoleGranted("SETTER", account);
    }

    function addAuthority(address account) external onlyAdmin {
        isAuthority[account] = true;
        emit RoleGranted("AUTHORITY", account);
    }

    function addCenter(address account) external onlyAdmin {
        isCenter[account] = true;
        emit RoleGranted("CENTER", account);
    }

    // ---------------------------------------------------------------- exam lifecycle

    function scheduleExam(string calldata subject, address setter, uint256 unlockTime)
        external
        onlyAdmin
        returns (uint256 examId)
    {
        require(isSetter[setter], "Not a registered setter");
        require(unlockTime > block.timestamp, "Unlock time must be in the future");

        examId = ++examCount;
        Exam storage e = exams[examId];
        e.subject = subject;
        e.setter = setter;
        e.unlockTime = unlockTime;
        e.status = Status.Scheduled;

        emit ExamScheduled(examId, subject, setter, unlockTime);
    }

    /// @notice Setter commits the encrypted paper. Once uploaded it can never be changed.
    function uploadPaper(
        uint256 examId,
        bytes32 paperHash,
        bytes32 encryptedHash,
        bytes32 keyCommitment,
        string calldata fileName
    ) external examExists(examId) {
        Exam storage e = exams[examId];
        require(msg.sender == e.setter, "Only assigned setter");
        require(e.status == Status.Scheduled, "Paper already uploaded");
        require(block.timestamp < e.unlockTime, "Exam already started");

        e.paperHash = paperHash;
        e.encryptedHash = encryptedHash;
        e.keyCommitment = keyCommitment;
        e.fileName = fileName;
        e.status = Status.Uploaded;

        emit PaperUploaded(examId, msg.sender, paperHash, encryptedHash, fileName);
    }

    /// @notice Centers log every download of the encrypted file (audit trail).
    function logDownload(uint256 examId) external onlyCenter examExists(examId) {
        Exam storage e = exams[examId];
        require(e.status == Status.Uploaded || e.status == Status.Released, "Paper not available");

        hasDownloaded[examId][msg.sender] = true;
        emit PaperDownloaded(examId, msg.sender, block.timestamp);
    }

    function approveRelease(uint256 examId) external examExists(examId) {
        require(isAuthority[msg.sender], "Only exam authority");
        Exam storage e = exams[examId];
        require(e.status == Status.Uploaded, "Paper not in uploaded state");
        require(!hasApproved[examId][msg.sender], "Already approved");

        hasApproved[examId][msg.sender] = true;
        e.approvals++;
        emit ReleaseApproved(examId, msg.sender, e.approvals);
    }

    /// @notice Time-locked, multi-approval key release. The key must match the
    ///         commitment made at upload time, so a fake key cannot be swapped in.
    function releaseKey(uint256 examId, bytes32 key) external examExists(examId) {
        Exam storage e = exams[examId];
        require(msg.sender == e.setter, "Only assigned setter");
        require(e.status == Status.Uploaded, "Paper not in uploaded state");
        require(block.timestamp >= e.unlockTime, "Exam has not started yet");
        require(e.approvals >= REQUIRED_APPROVALS, "Not enough approvals");
        require(keccak256(abi.encodePacked(key)) == e.keyCommitment, "Key does not match commitment");

        e.revealedKey = key;
        e.status = Status.Released;
        emit KeyReleased(examId, msg.sender, block.timestamp);
    }

    /// @notice Center records whether the decrypted paper matches the original hash.
    function recordVerification(uint256 examId, bytes32 computedHash) external onlyCenter examExists(examId) {
        Exam storage e = exams[examId];
        require(e.status == Status.Released, "Key not released yet");

        emit PaperVerified(examId, msg.sender, computedHash == e.paperHash);
    }

    /// @notice Anyone who finds a suspected leaked copy before the exam can hash it and
    ///         report it. If the hash matches the committed paper, the leak is proven
    ///         on-chain and the exam is marked compromised.
    function reportLeak(uint256 examId, bytes32 suspectedHash) external examExists(examId) {
        Exam storage e = exams[examId];
        require(e.status == Status.Uploaded, "Can only report before release");

        bool confirmed = suspectedHash == e.paperHash;
        if (confirmed) {
            e.status = Status.Compromised;
        }
        emit LeakReported(examId, msg.sender, confirmed, block.timestamp);
    }

    function cancelExam(uint256 examId) external onlyAdmin examExists(examId) {
        Exam storage e = exams[examId];
        require(e.status != Status.Released, "Already released");

        e.status = Status.Cancelled;
        emit ExamCancelled(examId);
    }

    // ---------------------------------------------------------------- views

    function getExam(uint256 examId) external view examExists(examId) returns (Exam memory) {
        return exams[examId];
    }
}
