import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Scroll, Wallet, CheckCircle2, XCircle, Activity, Info, ChevronRight, Loader2, AlertCircle, Globe, Link2, Gavel, ExternalLink, X, Sun, Moon, LogOut } from 'lucide-react';
import { ethers } from 'ethers';
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

declare global {
  interface Window {
    ethereum?: any;
  }
}

interface Claim {
  id: string;
  text: string;
  verdict: 'TRUE' | 'FALSE';
  consensus: string;
  reasoning: string;
  txHash: string;
  timestamp: number;
}

const CONTRACT_ADDRESS = '0x78fBC266A81c31132C58D08C72dD6E24a2d6723F';
const EXPLORER_URL = 'https://explorer-studio.genlayer.com';
const CHAIN_ID = '61999'; // 0xF22F
const RPC_URL = 'https://studio.genlayer.com/api';
const NETWORK_NAME = 'GenLayer StudioNet';
const CURRENCY_SYMBOL = 'GEN';



const INITIAL_CLAIMS: Claim[] = [];

export default function App() {
  const [claimText, setClaimText] = useState('');
  const [sourceUrl, setSourceUrl] = useState('https://en.wikipedia.org/wiki/Library_of_Alexandria');
  const [claims, setClaims] = useState<Claim[]>(INITIAL_CLAIMS);
  const [isVerifying, setIsVerifying] = useState(false);
  const [account, setAccount] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<'idle' | 'relaying' | 'finalized'>('idle');
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (newMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  useEffect(() => {
    const savedClaims = localStorage.getItem('histo_claims');
    if (savedClaims) {
      try {
        setClaims(JSON.parse(savedClaims));
      } catch (e) {
        console.error("Failed to load claims:", e);
      }
    }
  }, []);

  const disconnectWallet = () => {
    setAccount(null);
  };

  useEffect(() => {
    checkConnection();
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        setAccount(accounts[0] || null);
      });
    }
  }, []);

  const checkConnection = async () => {
    if (window.ethereum) {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.listAccounts();
        if (accounts.length > 0) {
          setAccount(accounts[0].address);
        }
      } catch (err) {
        console.error("Error checking connection:", err);
      }
    }
  };

  const switchNetwork = async () => {
    if (!window.ethereum) return;
    
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${Number(CHAIN_ID).toString(16)}` }],
      });
    } catch (switchError: any) {
      // This error code indicates that the chain has not been added to MetaMask.
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: `0x${Number(CHAIN_ID).toString(16)}`,
                chainName: NETWORK_NAME,
                rpcUrls: [RPC_URL],
                nativeCurrency: {
                  name: 'GenLayer',
                  symbol: CURRENCY_SYMBOL,
                  decimals: 18,
                },
                blockExplorerUrls: [EXPLORER_URL],
              },
            ],
          });
        } catch (addError: any) {
          throw new Error("Failed to add GenLayer StudioNet to your wallet.");
        }
      } else {
        throw new Error("Failed to switch to GenLayer StudioNet.");
      }
    }
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      setError("Please install a wallet like MetaMask to use HistoGen.");
      return;
    }
    setIsConnecting(true);
    setError(null);
    try {
      // Ensure we are on the correct network first
      await switchNetwork();
      
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      setAccount(accounts[0]);
    } catch (err: any) {
      setError(err.message || "Failed to connect wallet.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleVerify = async () => {
    if (!claimText.trim()) return;
    if (!account) {
      setError("Please connect your wallet first.");
      return;
    }
    
    setIsVerifying(true);
    setBridgeStatus('relaying');
    setError(null);
    
    try {
      // Get next claim ID from local storage or start at 1
      const savedCounter = localStorage.getItem('histo_counter') || '1';
      let claimId = parseInt(savedCounter, 10);
      
      // 1. Setup GenLayer Client using the official SDK
      const client = createClient({
        chain: studionet,
        provider: window.ethereum!,
        account: account as `0x${string}`,
      });
      
      // 2. Submit and Validate Claim in one transaction
      const txHash = await client.writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: 'submit_and_validate_claim',
        args: [claimText],
        value: BigInt(0),
      });

      const receipt = await client.waitForTransactionReceipt({ 
        hash: txHash,
        retries: 120,
        interval: 2000
      });
      
      if (receipt.status === 'reverted') {
        throw new Error("Transaction reverted by GenLayer validators (Consensus not reached). Please try again.");
      }

      setBridgeStatus('finalized');

      // 3. Get the actual Claim ID from the contract
      const count = await client.readContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: 'get_claim_count',
        args: [],
      });
      const actualClaimId = Number(count);

      // 4. Read Final Verdict from Contract
      const status = await client.readContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: 'get_claim_status',
        args: [actualClaimId],
      });

      // 5. Read Deterministic Reasoning from Contract
      const reasoning = await client.readContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        functionName: 'get_claim_reasoning',
        args: [actualClaimId],
      });

      const newClaim: Claim = {
        id: actualClaimId.toString(),
        text: claimText,
        verdict: status ? 'TRUE' : 'FALSE',
        consensus: '100% Match via Equivalence Principle',
        reasoning: reasoning as string,
        txHash: txHash,
        timestamp: Date.now()
      };
      
      // Sync local counter
      localStorage.setItem('histo_counter', (actualClaimId + 1).toString());
      
      setClaims(prev => {
        const updated = [newClaim, ...prev];
        localStorage.setItem('histo_claims', JSON.stringify(updated));
        return updated;
      });
      
      setClaimText('');
    } catch (err: any) {
      console.error("Verification error:", err);
      setError(err.message || "Verification failed. Ensure you are on GenLayer studioNet.");
    } finally {
      setIsVerifying(false);
      setTimeout(() => setBridgeStatus('idle'), 3000);
    }
  };

  const truncateAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <div className="min-h-screen bg-paper dark:bg-dark-bg selection:bg-teal-deep/10 dark:selection:bg-dark-teal/10 transition-colors duration-300">
      {/* Header Section */}
      <header className="sticky top-0 z-50 border-b border-teal-deep/5 dark:border-white/5 bg-paper/80 dark:bg-dark-bg/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-deep dark:bg-dark-teal text-paper dark:text-dark-bg shadow-lg shadow-teal-deep/20 dark:shadow-dark-teal/20">
              <Scroll size={24} strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="font-serif text-2xl font-bold tracking-tight text-teal-deep dark:text-dark-teal">HistoGen</h1>
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-teal-deep/40 dark:text-dark-teal/40">
                <Globe size={10} />
                Internet Court Resolution Layer
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-full border border-teal-deep/10 bg-teal-deep/5 text-teal-deep hover:bg-teal-deep/10 dark:border-white/10 dark:bg-white/5 dark:text-dark-teal transition-all"
              aria-label="Toggle dark mode"
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            
            {error && (
              <div className="hidden md:flex items-center gap-2 text-xs text-rose-600 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-100">
                <AlertCircle size={14} />
                {error}
              </div>
            )}
            
            {account ? (
              <div className="flex items-center gap-2">
                <div className="glass-hover flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-5 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  <Wallet size={16} className="text-emerald-600 dark:text-emerald-400" />
                  <span>{truncateAddress(account)}</span>
                </div>
                <button
                  onClick={disconnectWallet}
                  className="p-2 rounded-full border border-rose-500/10 bg-rose-500/5 text-rose-500 hover:bg-rose-500/10 transition-all"
                  title="Disconnect Wallet"
                >
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <button 
                onClick={connectWallet}
                disabled={isConnecting}
                className="glass-hover group flex items-center gap-2 rounded-full border border-teal-deep/10 bg-teal-deep/5 px-5 py-2 text-sm font-medium text-teal-deep hover:border-teal-deep/20 hover:bg-teal-deep/10 dark:border-white/10 dark:bg-white/5 dark:text-dark-teal dark:hover:bg-white/10 transition-all"
              >
                {isConnecting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Wallet size={16} className="text-teal-deep/70 dark:text-dark-teal/70" />
                )}
                <span>Connect Wallet</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <div className="mb-16 text-center lg:text-left">
          <motion.h1 
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="font-serif text-6xl md:text-7xl font-bold tracking-tight mb-4 bg-clip-text text-transparent bg-gradient-to-r from-teal-deep to-gold-antique dark:from-dark-teal dark:to-dark-gold"
          >
            HistoGen
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.3 }}
            className="max-w-3xl text-lg md:text-xl font-medium leading-relaxed mb-8 bg-clip-text text-transparent bg-gradient-to-r from-teal-deep/80 to-gold-antique/80 dark:from-dark-teal/80 dark:to-dark-gold/80"
          >
            Utilizing Intelligent Contracts on GenLayer to reach consensus on non-deterministic historical data through semantic equivalence.
          </motion.p>
          
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="inline-flex items-center gap-3 px-4 py-2 rounded-full border border-teal-deep/10 dark:border-white/10 bg-white/50 dark:bg-dark-paper/50 backdrop-blur-sm"
          >
            <motion.div
              animate={{
                scale: [1, 1.1, 1],
                boxShadow: [
                  "0 0 0 0px rgba(45, 212, 191, 0)",
                  "0 0 20px 2px rgba(45, 212, 191, 0.3)",
                  "0 0 0 0px rgba(45, 212, 191, 0)"
                ]
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="h-6 w-6 rounded-full bg-teal-deep dark:bg-dark-teal flex items-center justify-center text-paper dark:text-dark-bg shadow-lg"
            >
              <Activity size={12} />
            </motion.div>
            <span className="text-xs font-bold uppercase tracking-widest text-teal-deep/60 dark:text-dark-teal/60">
              GenLayer Execution Stack
            </span>
          </motion.div>
        </div>

        {/* Bridge Status Banner */}
        <AnimatePresence>
          {bridgeStatus !== 'idle' && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mb-8 overflow-hidden"
            >
              <div className={`flex items-center justify-between rounded-2xl border px-6 py-3 text-sm font-medium ${
                bridgeStatus === 'relaying' 
                  ? 'border-gold-antique/20 bg-gold-antique/5 text-gold-antique' 
                  : 'border-emerald-500/20 bg-emerald-500/5 text-emerald-700'
              }`}>
                <div className="flex items-center gap-3">
                  {bridgeStatus === 'relaying' ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  <span>
                    {bridgeStatus === 'relaying' 
                      ? 'Relaying consensus to studioNet via GenLayer Bridge...' 
                      : 'State finalized on-chain. Bridge callback successful.'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest opacity-60">
                  <Link2 size={12} />
                  GenLayer Bridge Service
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Hero Card */}
        <div className="grid gap-8 lg:grid-cols-3">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:col-span-2"
          >
            <div className="h-full rounded-3xl border border-teal-deep/10 dark:border-white/10 bg-white dark:bg-dark-paper p-8 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-serif text-2xl font-semibold text-teal-deep dark:text-dark-teal">
                  Submit a Historical Claim for Validation
                </h2>
                {!account && (
                  <span className="text-xs font-medium text-rose-500 bg-rose-50 dark:bg-rose-500/10 px-2 py-1 rounded border border-rose-100 dark:border-rose-500/20">
                    Wallet Required
                  </span>
                )}
              </div>
              
              <div className="space-y-6">
                <div className="relative">
                  <textarea
                    value={claimText}
                    onChange={(e) => setClaimText(e.target.value)}
                    disabled={!account || isVerifying}
                    placeholder={account ? "e.g., The Library of Alexandria was destroyed by a single fire in 48 BC." : "Connect wallet to start validating..."}
                    className="h-48 w-full resize-none rounded-2xl border border-teal-deep/10 dark:border-white/10 bg-paper/50 dark:bg-dark-bg/50 p-6 text-lg placeholder:text-teal-deep/30 dark:placeholder:text-dark-teal/30 text-teal-deep dark:text-slate-200 focus:border-teal-deep/30 dark:focus:border-dark-teal/30 focus:bg-white dark:focus:bg-dark-bg focus:outline-none focus:ring-0 transition-all disabled:opacity-50"
                  />
                </div>
                
                <div className="flex flex-wrap items-center gap-4">
                  <button
                    onClick={handleVerify}
                    disabled={isVerifying || !claimText.trim() || !account}
                    className="relative flex items-center gap-2 rounded-xl bg-teal-deep dark:bg-dark-teal px-8 py-4 font-semibold text-paper dark:text-dark-bg shadow-lg shadow-teal-deep/20 dark:shadow-dark-teal/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
                  >
                    {isVerifying ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="animate-spin" size={20} />
                        <span>Decentralized AI Consensus...</span>
                      </div>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Gavel size={18} />
                        Verify Claim
                      </span>
                    )}
                  </button>
                  
                  <motion.div 
                    animate={{
                      scale: [1, 1.05, 1],
                      opacity: [0.7, 1, 0.7],
                    }}
                    transition={{
                      duration: 2.5,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                    className="flex items-center gap-2 rounded-lg border border-gold-antique/30 bg-gold-antique/10 dark:bg-dark-gold/20 px-4 py-2 text-xs font-bold text-gold-antique dark:text-dark-gold shadow-lg shadow-gold-antique/5"
                  >
                    <div className="h-2 w-2 animate-pulse rounded-full bg-gold-antique dark:bg-dark-gold" />
                    Consensus: Optimistic Democracy
                  </motion.div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Process Visualizer */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="h-full rounded-3xl border border-teal-deep/10 dark:border-white/10 bg-white dark:bg-dark-paper p-8 shadow-sm">
              <h3 className="mb-8 flex items-center gap-2 font-serif text-xl font-semibold text-teal-deep dark:text-dark-teal">
                <Activity size={20} className="text-gold-antique dark:text-dark-gold" />
                GenLayer Execution Stack
              </h3>
              
              <div className="relative space-y-12 before:absolute before:left-[11px] before:top-2 before:h-[calc(100%-16px)] before:w-0.5 before:bg-teal-deep/5 dark:before:bg-white/5">
                {[
                  { title: 'Leader LLM', desc: 'Validators choose and optimize LLMs for initial truth value.', status: isVerifying ? 'active' : 'idle' },
                  { title: 'Equivalence Check', desc: 'Cross-references semantic meaning across decentralized validator nodes.', status: isVerifying ? 'pending' : 'idle' },
                  { title: 'Bridge Relay', desc: 'Pushing results to studioNet via GenLayer Bridge.', status: bridgeStatus === 'relaying' ? 'active' : 'idle' },
                  { title: 'Finality', desc: 'State updated on-chain in the Internet Court.', status: bridgeStatus === 'finalized' ? 'active' : 'idle' }
                ].map((step, idx) => (
                  <div key={idx} className="relative flex gap-6 pl-1">
                    <div className={`z-10 mt-1 h-5 w-5 rounded-full border-2 bg-white dark:bg-dark-paper transition-colors duration-500 ${
                      step.status === 'active' ? 'border-gold-antique dark:border-dark-gold' : 
                      step.status === 'pending' ? 'border-teal-deep/40 dark:border-dark-teal/40 border-dashed animate-spin' :
                      'border-teal-deep/20 dark:border-white/20'
                    }`}>
                      {step.status === 'active' && <div className="m-0.5 h-3 w-3 animate-pulse rounded-full bg-gold-antique dark:bg-dark-gold" />}
                    </div>
                    <div>
                      <h4 className="font-semibold text-teal-deep dark:text-dark-teal">{step.title}</h4>
                      <p className="mt-1 text-sm text-teal-deep/60 dark:text-slate-400 leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        {/* The Historical Ledger */}
        <section className="mt-16">
          <div className="mb-8 flex items-center justify-between">
            <h2 className="font-serif text-3xl font-bold text-teal-deep dark:text-dark-teal">Verified Truth Ledger</h2>
            <div className="text-sm text-teal-deep/50 dark:text-dark-teal/50">
              Total Validated: {claims.length}
            </div>
          </div>
          
          <div className="overflow-hidden rounded-3xl border border-teal-deep/10 dark:border-white/10 bg-white dark:bg-dark-paper shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-teal-deep/5 dark:border-white/5 bg-teal-deep/[0.02] dark:bg-white/[0.02]">
                    <th className="px-8 py-5 text-sm font-semibold uppercase tracking-wider text-teal-deep/60 dark:text-dark-teal/60">Claim</th>
                    <th className="px-8 py-5 text-sm font-semibold uppercase tracking-wider text-teal-deep/60 dark:text-dark-teal/60">Verdict</th>
                    <th className="px-8 py-5 text-sm font-semibold uppercase tracking-wider text-teal-deep/60 dark:text-dark-teal/60">Consensus</th>
                    <th className="px-8 py-5 text-sm font-semibold uppercase tracking-wider text-teal-deep/60 dark:text-dark-teal/60">AI Reasoning</th>
                    <th className="px-8 py-5 text-sm font-semibold uppercase tracking-wider text-teal-deep/60 dark:text-dark-teal/60">Bridge TX</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-teal-deep/5 dark:divide-white/5">
                  <AnimatePresence mode="popLayout">
                    {claims.map((claim) => (
                      <motion.tr
                        key={claim.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        onClick={() => setSelectedClaim(claim)}
                        className="group cursor-pointer transition-colors hover:bg-teal-deep/[0.01] dark:hover:bg-white/[0.01]"
                      >
                        <td className="px-8 py-6">
                          <p className="max-w-md font-medium text-teal-deep dark:text-slate-200">{claim.text}</p>
                        </td>
                        <td className="px-8 py-6">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold tracking-wide ${
                            claim.verdict === 'TRUE' 
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' 
                              : 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400'
                          }`}>
                            {claim.verdict === 'TRUE' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                            {claim.verdict}
                          </span>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-2 text-sm text-teal-deep/70 dark:text-dark-teal/70">
                            <Info size={14} className="text-gold-antique dark:text-dark-gold" />
                            {claim.consensus}
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex items-center justify-between gap-4">
                            <p className="max-w-xs text-sm italic text-teal-deep/60 dark:text-slate-400 line-clamp-2">
                              "{claim.reasoning}"
                            </p>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <a 
                            href={`${EXPLORER_URL}/transactions/${claim.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-2 font-mono text-[10px] text-teal-deep/40 dark:text-dark-teal/40 hover:text-teal-deep dark:hover:text-dark-teal transition-colors"
                          >
                            <Link2 size={12} />
                            {claim.txHash.slice(0, 10)}...
                            <ExternalLink size={10} />
                          </a>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Details Modal */}
        <AnimatePresence>
          {selectedClaim && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedClaim(null)}
                className="absolute inset-0 bg-teal-deep/20 backdrop-blur-sm"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-teal-deep/10 dark:border-white/10 bg-white dark:bg-dark-paper p-8 shadow-2xl"
              >
                <button 
                  onClick={() => setSelectedClaim(null)}
                  className="absolute right-6 top-6 rounded-full p-2 text-teal-deep/20 dark:text-white/20 transition-colors hover:bg-teal-deep/5 dark:hover:bg-white/5 hover:text-teal-deep dark:hover:text-dark-teal"
                >
                  <X size={20} />
                </button>

                <div className="mb-8">
                  <div className={`mb-4 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold tracking-wide ${
                    selectedClaim.verdict === 'TRUE' 
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' 
                      : 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400'
                  }`}>
                    {selectedClaim.verdict === 'TRUE' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                    VERDICT: {selectedClaim.verdict}
                  </div>
                  <h2 className="font-serif text-2xl font-bold text-teal-deep dark:text-dark-teal leading-tight">
                    {selectedClaim.text}
                  </h2>
                </div>

                <div className="space-y-6">
                  <div>
                    <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-teal-deep/40 dark:text-dark-teal/40">
                      <Activity size={14} />
                      AI Reasoning & Consensus
                    </h3>
                    <div className="rounded-2xl border border-teal-deep/5 dark:border-white/5 bg-paper/50 dark:bg-dark-bg/50 p-6">
                      <p className="text-lg italic text-teal-deep/80 dark:text-slate-200 leading-relaxed">
                        "{selectedClaim.reasoning}"
                      </p>
                      <div className="mt-4 flex items-center gap-2 text-sm font-medium text-gold-antique dark:text-dark-gold">
                        <Info size={16} />
                        {selectedClaim.consensus}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-teal-deep/40 dark:text-dark-teal/40">Timestamp</h3>
                      <p className="text-sm font-medium text-teal-deep dark:text-slate-200">
                        {new Date(selectedClaim.timestamp).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-teal-deep/40 dark:text-dark-teal/40">Network</h3>
                      <p className="text-sm font-medium text-teal-deep dark:text-slate-200">GenLayer studioNet</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-teal-deep/40 dark:text-dark-teal/40">Transaction Hash</h3>
                    <a 
                      href={`${EXPLORER_URL}/transactions/${selectedClaim.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between rounded-xl border border-teal-deep/10 dark:border-white/10 bg-teal-deep/5 dark:bg-white/5 px-4 py-3 text-sm font-mono text-teal-deep dark:text-dark-teal transition-all hover:bg-teal-deep/10 dark:hover:bg-white/10"
                    >
                      <span className="truncate mr-4">{selectedClaim.txHash}</span>
                      <ExternalLink size={16} className="shrink-0" />
                    </a>
                  </div>
                </div>

                <div className="mt-8 pt-8 border-t border-teal-deep/5 dark:border-white/5">
                  <button 
                    onClick={() => setSelectedClaim(null)}
                    className="w-full rounded-xl bg-teal-deep dark:bg-dark-teal py-4 font-semibold text-paper dark:text-dark-bg shadow-lg shadow-teal-deep/20 dark:shadow-dark-teal/20 transition-all hover:scale-[1.01] active:scale-[0.99]"
                  >
                    Close Details
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Technology & Mission Section */}
        <section className="mt-20 grid gap-8 md:grid-cols-2">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-3xl border border-teal-deep/10 dark:border-white/10 bg-white dark:bg-dark-paper p-8 shadow-sm"
          >
            <h3 className="mb-6 flex items-center gap-2 font-serif text-2xl font-semibold text-teal-deep dark:text-dark-teal">
              The Technology 🛠️
            </h3>
            <div className="space-y-4 text-sm leading-relaxed text-teal-deep/70 dark:text-slate-400">
              <p className="font-medium text-teal-deep dark:text-slate-200">HistoGen tackles non-deterministic historical data by building on GenLayer.</p>
              <ul className="space-y-3">
                <li className="flex gap-2">
                  <span className="text-gold-antique dark:text-dark-gold font-bold">•</span>
                  <span><strong className="text-teal-deep dark:text-dark-teal">Intelligent Contracts:</strong> Unlike traditional code, our contracts process natural language, allowing them to interpret complex historical claims and deploy AI validators.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-gold-antique dark:text-dark-gold font-bold">•</span>
                  <span><strong className="text-teal-deep dark:text-dark-teal">Optimistic Democracy:</strong> Claims are evaluated by a decentralized jury of varying LLM nodes. They independently research the history and vote, ensuring no single AI dictates the truth.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-gold-antique dark:text-dark-gold font-bold">•</span>
                  <span><strong className="text-teal-deep dark:text-dark-teal">Equivalence Principle:</strong> Because independent AIs explain findings differently, the network compares their semantic meaning instead of exact words. If the core historical facts match, a binding consensus is finalized on-chain.</span>
                </li>
              </ul>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="rounded-3xl border border-teal-deep/10 dark:border-white/10 bg-white dark:bg-dark-paper p-8 shadow-sm"
          >
            <h3 className="mb-6 flex items-center gap-2 font-serif text-2xl font-semibold text-teal-deep dark:text-dark-teal">
              The Mission 🏆
            </h3>
            <div className="space-y-4 text-sm leading-relaxed text-teal-deep/70 dark:text-slate-400">
              <p>HistoGen’s mission is to build a decentralized, unbiased ledger of human history. Since historical records are inherently subjective and non-deterministic, traditional smart contracts cannot process them. We are building on GenLayer to solve this.</p>
              <p>Through Intelligent Contracts, we empower AI to analyze natural language and conflicting historical accounts.</p>
              <p>Truth should never be dictated by one entity. Using Optimistic Democracy, a decentralized jury of varied AI validators independently evaluates claims and votes to reach consensus.</p>
              <p>By applying the Equivalence Principle, the network matches the semantic meaning of these AI findings, ignoring exact phrasing to forge a mathematically verifiable, on-chain historical truth.</p>
            </div>
          </motion.div>
        </section>

        {/* Footer */}
        <footer className="mt-20 border-t border-teal-deep/5 dark:border-white/5 pt-12 pb-20 text-center">
          <div className="mx-auto max-w-2xl">
            <div className="flex flex-wrap justify-center gap-4 text-[10px] font-bold uppercase tracking-[0.2em] text-teal-deep/20 dark:text-dark-teal/20">
              <span>GenLayer studioNet</span>
              <span>•</span>
              <span>GenLayer Bridge Service</span>
              <span>•</span>
              <span>Internet Court Protocol</span>
            </div>
            <div className="mt-8 pt-8 border-t border-teal-deep/5 dark:border-white/5">
              <p className="text-xs font-medium text-teal-deep/40 dark:text-dark-teal/40">
                Built by <a href="https://x.com/lamide_nova" target="_blank" rel="noopener noreferrer" className="text-teal-deep dark:text-dark-teal hover:underline transition-all">ODbeke</a>
              </p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
