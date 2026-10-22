// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// A minimal ERC-1271 account: valid iff the hash was signed by its owner. This is what a single-owner smart wallet does.
contract OwnerWallet {
    address public owner;
    constructor(address o) { owner = o; }
    function isValidSignature(bytes32 h, bytes calldata sig) external view returns (bytes4) {
        require(sig.length == 65, "len");
        bytes32 r; bytes32 s; uint8 v;
        assembly { r := calldataload(sig.offset) s := calldataload(add(sig.offset, 32)) v := byte(0, calldataload(add(sig.offset, 64))) }
        return ecrecover(h, v, r, s) == owner ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }
}

/// A 2-of-2 style account (like a Safe): the signature is two concatenated 65-byte signatures, both owners must have signed.
contract TwoOfTwoWallet {
    address public a; address public b;
    constructor(address x, address y) { a = x; b = y; }
    function rec(bytes32 h, bytes calldata sig, uint256 off) internal pure returns (address) {
        bytes32 r; bytes32 s; uint8 v;
        assembly { r := calldataload(add(sig.offset, off)) s := calldataload(add(sig.offset, add(off, 32))) v := byte(0, calldataload(add(sig.offset, add(off, 64)))) }
        return ecrecover(h, v, r, s);
    }
    function isValidSignature(bytes32 h, bytes calldata sig) external view returns (bytes4) {
        require(sig.length == 130, "len");
        return (rec(h, sig, 0) == a && rec(h, sig, 65) == b) ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }
}

/// A hostile contract: claims EVERY signature is valid. Used to prove we only trust the answer for the address the user named.
contract AlwaysYes {
    function isValidSignature(bytes32, bytes calldata) external pure returns (bytes4) { return 0x1626ba7e; }
}

/// A contract that reverts, to prove errors never count as valid.
contract Reverts { function isValidSignature(bytes32, bytes calldata) external pure returns (bytes4) { revert("no"); } }
