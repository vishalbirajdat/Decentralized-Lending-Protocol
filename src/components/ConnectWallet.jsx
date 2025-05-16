import { useEffect, useState } from 'react';
import { ethers } from 'ethers';

export default function ConnectWallet({ onConnect }) {
  const [address, setAddress] = useState('');

  const connect = async () => {
    if (window.ethereum) {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send('eth_requestAccounts', []);
      const signer = await provider.getSigner();
      const addr = await signer.getAddress();
      setAddress(addr);
      onConnect({ provider, signer, address: addr });
    } else {
      alert('MetaMask not found');
    }
  };

  return (
    <div className="mb-4">
      {address ? (
        <p className="text-green-600">Connected: {address.slice(0, 6)}...{address.slice(-4)}</p>
      ) : (
        <button onClick={connect} className="bg-purple-600 text-white px-4 py-2 rounded">
          Connect Wallet
        </button>
      )}
    </div>
  );
}
