import React, { useState, useEffect } from 'react';
import { 
  Wallet, 
  Coins, 
  Rocket, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  ExternalLink
} from 'lucide-react';
import { ethers } from 'https://cdnjs.cloudflare.com/ajax/libs/ethers/6.11.1/ethers.min.js';

// Network configurations for Base Mainnet and Base Sepolia
const NETWORKS = {
  8453: { name: 'Base Mainnet', hex: '0x2105', explorer: 'https://basescan.org' },
  84532: { name: 'Base Sepolia', hex: '0x14a33', explorer: 'https://sepolia.basescan.org' }
};

// B20 Standard Constants
const B20_FACTORY_ADDRESS = "0xB20f000000000000000000000000000000000000";
const ASSET_VARIANT = 0; // 0 for ASSET, 1 for STABLECOIN

// ABIs needed for encoding and interacting
const FACTORY_ABI = [
  "function createB20(uint8 variant, bytes32 salt, bytes params, bytes[] initCalls) external returns (address)"
];

const TOKEN_ABI = [
  "function mint(address to, uint256 amount)",
  "function grantRole(bytes32 role, address account)",
  "function updateSupplyCap(uint256 newCap)"
];

export default function B20LauncherApp() {
  // Wallet State
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState('');
  const [chainId, setChainId] = useState(null);

  // Form State
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [maxSupply, setMaxSupply] = useState('1000000');

  // App State
  const [status, setStatus] = useState('idle'); // idle, connecting, deploying, minting, success, error
  const [errorMsg, setErrorMsg] = useState('');
  const [tokenAddress, setTokenAddress] = useState('');

  const connectWallet = async () => {
    if (!window.ethereum) {
      setErrorMsg("No crypto wallet found. Please install Coinbase Wallet or MetaMask.");
      setStatus('error');
      return;
    }

    setStatus('connecting');
    setErrorMsg('');

    try {
      const web3Provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const web3Signer = await web3Provider.getSigner();
      const network = await web3Provider.getNetwork();

      setProvider(web3Provider);
      setSigner(web3Signer);
      setAccount(accounts[0]);
      setChainId(Number(network.chainId));

      if (!NETWORKS[Number(network.chainId)]) {
        setErrorMsg("Please switch to Base Mainnet or Base Sepolia.");
        setStatus('error');
      } else {
        setStatus('idle');
      }

      // Listen for network/account changes
      window.ethereum.on('chainChanged', () => window.location.reload());
      window.ethereum.on('accountsChanged', () => window.location.reload());
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Failed to connect wallet.");
      setStatus('error');
    }
  };

  const launchToken = async (e) => {
    e.preventDefault();
    if (!name || !symbol || !maxSupply || !signer || !account) return;
    
    setStatus('deploying');
    setErrorMsg('');
    setTokenAddress('');

    try {
      // 1. Prepare Encodings for B20 Creation
      const salt = ethers.hexlify(ethers.randomBytes(32)); // Random salt for deterministic address
      
      // Encode params: (name, symbol, initial_admin, decimals)
      const defaultAbiCoder = ethers.AbiCoder.defaultAbiCoder();
      const params = defaultAbiCoder.encode(
        ["string", "string", "address", "uint8"], 
        [name, symbol, account, 18]
      );

      // Encode initCalls: grantRole(MINT_ROLE, account) & updateSupplyCap(maxSupply)
      const tokenInterface = new ethers.Interface(TOKEN_ABI);
      const mintRole = ethers.id("MINT_ROLE");
      const supplyCapWei = ethers.parseUnits(maxSupply.toString(), 18);

      const grantRoleCall = tokenInterface.encodeFunctionData("grantRole", [mintRole, account]);
      const updateCapCall = tokenInterface.encodeFunctionData("updateSupplyCap", [supplyCapWei]);
      const initCalls = [grantRoleCall, updateCapCall];

      // 2. Deploy B20 via Factory
      const factoryContract = new ethers.Contract(B20_FACTORY_ADDRESS, FACTORY_ABI, signer);
      
      const deployTx = await factoryContract.createB20(
        ASSET_VARIANT,
        salt,
        params,
        initCalls
      );
      
      const receipt = await deployTx.wait();

      // Find the B20 address in the logs (B20 addresses start with 0xb200)
      let deployedAddress = '';
      for (const log of receipt.logs) {
        if (log.address.toLowerCase().startsWith('0xb200')) {
          deployedAddress = log.address;
          break;
        }
      }

      if (!deployedAddress) {
        throw new Error("Token deployed, but address could not be extracted from logs.");
      }

      setTokenAddress(deployedAddress);
      setStatus('minting');

      // 3. Mint Initial Supply
      const tokenContract = new ethers.Contract(deployedAddress, TOKEN_ABI, signer);
      const mintTx = await tokenContract.mint(account, supplyCapWei);
      
      await mintTx.wait();
      setStatus('success');

    } catch (err) {
      console.error(err);
      setErrorMsg(err.reason || err.message || "Transaction failed.");
      setStatus('error');
    }
  };

  const formatAddress = (addr) => {
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
  };

  const currentNetwork = NETWORKS[chainId];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-500/30">
      
      {/* Navbar */}
      <nav className="border-b border-slate-800 bg-slate-950/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
              <span className="text-white font-bold text-lg">B</span>
            </div>
            <span className="font-semibold text-lg tracking-tight">B20 Launcher</span>
          </div>

          <div>
            {!account ? (
              <button 
                onClick={connectWallet}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full font-medium transition-colors text-sm"
              >
                <Wallet size={16} />
                Connect Wallet
              </button>
            ) : (
              <div className="flex items-center gap-3">
                {currentNetwork && (
                  <span className="px-3 py-1 rounded-full bg-slate-800 text-xs font-medium text-slate-300 border border-slate-700">
                    {currentNetwork.name}
                  </span>
                )}
                <span className="px-4 py-2 rounded-full bg-slate-900 border border-slate-800 text-sm font-medium">
                  {formatAddress(account)}
                </span>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-xl mx-auto px-6 py-16">
        
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
            Launch Native Base Tokens
          </h1>
          <p className="text-slate-400">
            Deploy an ERC-20 superset token directly to the Base network in a single transaction. No smart contract coding required.
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-slate-900 rounded-2xl p-8 border border-slate-800 shadow-xl relative overflow-hidden">
          
          {/* Background Glow */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-600/20 rounded-full blur-3xl pointer-events-none"></div>

          {!account ? (
            <div className="text-center py-12">
              <Coins className="mx-auto h-16 w-16 text-slate-600 mb-4" />
              <h3 className="text-xl font-semibold mb-2">Connect to start</h3>
              <p className="text-slate-400 mb-6 text-sm">You need to connect a wallet on Base or Base Sepolia to deploy a token.</p>
              <button 
                onClick={connectWallet}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-medium transition-all shadow-lg shadow-blue-500/20 active:scale-95"
              >
                Connect Wallet
              </button>
            </div>
          ) : (
            <form onSubmit={launchToken} className="space-y-6">
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Token Name</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Base Protocol"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={status === 'deploying' || status === 'minting'}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Symbol</label>
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. BASE"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    disabled={status === 'deploying' || status === 'minting'}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all uppercase"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Total Supply</label>
                  <input 
                    type="number" 
                    required
                    min="1"
                    placeholder="1000000"
                    value={maxSupply}
                    onChange={(e) => setMaxSupply(e.target.value)}
                    disabled={status === 'deploying' || status === 'minting'}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>
              </div>

              {/* Status & Action Area */}
              <div className="pt-4">
                {status === 'error' && (
                  <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-start gap-3 text-sm">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <p className="break-words">{errorMsg}</p>
                  </div>
                )}

                {status === 'success' ? (
                  <div className="p-6 rounded-xl bg-green-500/10 border border-green-500/20 text-center animate-in fade-in zoom-in duration-300">
                    <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
                    <h3 className="text-lg font-semibold text-green-400 mb-1">Token Launched Successfully!</h3>
                    <p className="text-slate-400 text-sm mb-4">Your token was deployed and the supply has been minted to your wallet.</p>
                    
                    <a 
                      href={`${currentNetwork?.explorer}/token/${tokenAddress}`} 
                      target="_blank" 
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 bg-slate-950 hover:bg-slate-800 border border-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      View on Basescan <ExternalLink size={14} />
                    </a>
                    
                    <button 
                      onClick={() => { setStatus('idle'); setName(''); setSymbol(''); setTokenAddress(''); }}
                      className="block w-full mt-4 text-sm text-slate-400 hover:text-white"
                    >
                      Launch another token
                    </button>
                  </div>
                ) : (
                  <button
                    type="submit"
                    disabled={status === 'deploying' || status === 'minting'}
                    className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all ${
                      status === 'idle' || status === 'error'
                        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20 active:scale-95'
                        : 'bg-slate-800 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    {status === 'deploying' && <><Loader2 className="animate-spin" /> Deploying B20 Contract...</>}
                    {status === 'minting' && <><Loader2 className="animate-spin" /> Minting Supply...</>}
                    {(status === 'idle' || status === 'error') && <><Rocket size={20} /> Launch & Mint Token</>}
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
        
        {/* Info Box */}
        <div className="mt-8 p-4 rounded-xl border border-slate-800 bg-slate-900/50 flex items-start gap-4">
          <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
            <Coins size={16} />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-200 mb-1">What happens when I click Launch?</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              This app uses the <strong>B20 Factory Precompile</strong> native to Base. It creates a brand new asset and atomically updates the supply cap and your minting privileges in one transaction. Afterwards, it triggers a second transaction to mint the total supply directly to your connected wallet.
            </p>
          </div>
        </div>

      </main>
    </div>
  );
}