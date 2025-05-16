// App.js
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import LendingProtocolABI from "./abis/LendingProtocol.json";
import USDTTokenABI from "./abis/USDTToken.json";
import ConnectWallet from "./components/ConnectWallet";

const lendingAddress = "0x07e97Dae913F0AdA300d59357D9EaaeB60d244ee";
const usdtAddress = "0x17129Ce1bdD0A7892a92419E037a8020B5b74F54";
const priceFeedDecimals = 8;

const interestRatePerYear = 5; // %
const collateralFactor = 150; // %
const maxLoanDurationSeconds = 30 * 24 * 60 * 60; // 30 days in seconds

function formatTimestamp(ts) {
  return new Date(ts * 1000).toLocaleString();
}

export default function App() {
  const [ethPrice, setEthPrice] = useState(0);
  const [usdtAmount, setUsdtAmount] = useState("");
  const [ethCollateral, setEthCollateral] = useState("");
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [lendingContract, setLendingContract] = useState(null);
  const [usdtContract, setUsdtContract] = useState(null);
  const [loans, setLoans] = useState([]);
  const [connected, setConnected] = useState(false);
  const [userAddress, setUserAddress] = useState(null);
  const [warning, setWarning] = useState("");

  // Called on wallet connect
  const onWalletConnect = async ({ provider, signer }) => {
    setProvider(provider);
    setSigner(signer);

    const lending = new ethers.Contract(lendingAddress, LendingProtocolABI, signer);
    const usdt = new ethers.Contract(usdtAddress, USDTTokenABI, signer);

    setLendingContract(lending);
    setUsdtContract(usdt);
    setConnected(true);

    // Get ETH price from contract (Chainlink)
    const price = await lending.getETHUSDPrice();
    setEthPrice(Number(price) / 10 ** priceFeedDecimals);

    const user = await signer.getAddress();
    setUserAddress(user);

    // Load user loans (max 10 for demo)
    const userLoans = [];
    for (let i = 0; i < 10; i++) {
      try {
        const loan = await lending.loans(user, i);
        console.log({loan:loan.principal});
        if (loan.principal == 0 && loan.collateralETH == 0) break;
        userLoans.push(loan);
      } catch (error){
        console.log({error});
        break;
      }
    }
    setLoans(userLoans);
  };

  // Calculate ETH collateral required whenever usdtAmount or ethPrice changes
  useEffect(() => {
    if (ethPrice && usdtAmount) {
      const required = (parseFloat(usdtAmount) * collateralFactor) / 100 / ethPrice;
      setEthCollateral(required.toFixed(6));
    } else {
      setEthCollateral("");
    }
  }, [ethPrice, usdtAmount]);

  // Check loan health and expiry for warnings
  useEffect(() => {
    if (!loans.length || !ethPrice) {
      setWarning("");
      return;
    }

    let warningMsg = "";
    const now = Math.floor(Date.now() / 1000);

    for (const loan of loans) {
      const principal = loan.principal.toString()
      const interest = loan.interestAccrued.toString()
      const collateralETH = loan.collateralETH.toString();
      const startTime = Number(loan.startTimestamp);

      const totalDebtUSDT = principal + interest;
      const totalDebtFloat = Number(ethers.formatUnits(totalDebtUSDT, 6));

      const collateralETHFloat = Number(ethers.formatEther(collateralETH));
      const collateralUSD = collateralETHFloat * ethPrice;

      const minCollateralUSD = totalDebtFloat * (collateralFactor / 100);

      if (collateralUSD < minCollateralUSD) {
        warningMsg = "⚠️ Your collateral value is below required minimum! Risk of liquidation.";
        break;
      }

      if (now > startTime + maxLoanDurationSeconds) {
        warningMsg = "⚠️ One or more loans have expired! Please repay or risk liquidation.";
        break;
      }
    }
    setWarning(warningMsg);
  }, [loans, ethPrice]);

  // Take loan tx
  const takeLoan = async () => {
    if (!lendingContract) return alert("Connect your wallet first");

    try {
      const collateralInWei = ethers.parseEther(ethCollateral);
      const usdtAmountParsed = ethers.parseUnits(usdtAmount, 6);

      const tx = await lendingContract.takeLoan(usdtAmountParsed, { value: collateralInWei });
      await tx.wait();

      alert("Loan Taken!");

      // Refresh loans
      const userLoans = [];
      for (let i = 0; i < 10; i++) {
        try {
          const loan = await lendingContract.loans(userAddress, i);
          if (loan.principal.eq(0) && loan.collateralETH.eq(0)) break;
          userLoans.push(loan);
        } catch {
          break;
        }
      }
      setLoans(userLoans);
    } catch (err) {
      console.error(err);
      alert("Transaction failed");
    }
  };

  // Repay loan at index
  const repayLoan = async (index) => {
    if (!lendingContract || !usdtContract || !userAddress) return;

    try {
      const loan = loans[index];
      if (!loan) return;

      const principal = loan.principal.toString();
      const interest = loan.interestAccrued.toString();
      const totalDebt = principal + interest;

      // Approve USDT spend for lending contract
      const approveTx = await usdtContract.approve(lendingAddress, totalDebt);
      await approveTx.wait();

      // Call repayLoan with index and amount
      // NOTE: Make sure your Solidity function is updated to accept index as param!
      const repayTx = await lendingContract.repayLoan(index, totalDebt);
      await repayTx.wait();

      alert("Loan repaid!");

      // Refresh loans
      const userLoans = [];
      for (let i = 0; i < 10; i++) {
        try {
          const loan = await lendingContract.loans(userAddress, i);
          if (loan.principal.eq(0) && loan.collateralETH.eq(0)) break;
          userLoans.push(loan);
        } catch {
          break;
        }
      }
      setLoans(userLoans);
    } catch (err) {
      console.error(err);
      alert("Repayment failed");
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Lending DApp</h1>

      <div className="mb-6 bg-blue-50 border border-blue-300 p-4 rounded">
        <h2 className="text-xl font-semibold mb-2">Loan Parameters</h2>
        <ul className="list-disc pl-5 space-y-1 text-gray-700">
          <li>Interest Rate: {interestRatePerYear}% per year</li>
          <li>Collateral Factor: {collateralFactor}% (ETH collateral required)</li>
          <li>Max Loan Duration: {maxLoanDurationSeconds / (24 * 3600)} days</li>
        </ul>
      </div>

      <ConnectWallet onConnect={onWalletConnect} />

      {connected && (
        <>
          <p className="mb-4">
            Current ETH/USD Price: <strong>${ethPrice.toFixed(2)}</strong>
          </p>

          <div className="mb-8">
            <label className="block mb-1 font-medium">USDT Amount to Borrow</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={usdtAmount}
              onChange={(e) => setUsdtAmount(e.target.value)}
              className="w-full p-2 border rounded"
              placeholder="Enter USDT amount"
            />
            <p className="mt-1 text-gray-600">
              Required ETH Collateral: <strong>{ethCollateral || "-"}</strong> ETH
            </p>
            <button
              onClick={takeLoan}
              disabled={!usdtAmount || !ethCollateral}
              className="mt-3 px-5 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Take Loan
            </button>
          </div>

          {warning && (
            <div className="mb-6 p-3 bg-red-100 text-red-700 rounded">{warning}</div>
          )}

          {loans.length > 0 && (
            <div>
              <h2 className="text-2xl font-semibold mb-4">Your Loans</h2>
              {loans.map((loan, i) => {
                const principal = ethers.formatUnits(loan.principal, 6);
                const interest = ethers.formatUnits(loan.interestAccrued, 6);
                const collateralETH = ethers.formatEther(loan.collateralETH);
                const startTimestamp = Number(loan.startTimestamp);
                const expiryTimestamp = startTimestamp + maxLoanDurationSeconds;

                return (
                  <div
                    key={i}
                    className="mb-4 p-4 border rounded shadow-sm bg-white"
                  >
                    <p className="font-semibold mb-1">Loan #{i + 1}</p>
                    <p>Principal (USDT): {principal}</p>
                    <p>Interest Accrued (USDT): {interest}</p>
                    <
                      p>Collateral (ETH): {collateralETH}</p>
                    <p>Loan Start: {formatTimestamp(startTimestamp)}</p>
                    <p>Loan Expiry: {formatTimestamp(expiryTimestamp)}</p>
                    <button
                      onClick={() => repayLoan(i)}
                      className="mt-2 px-4 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      Repay Loan
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}