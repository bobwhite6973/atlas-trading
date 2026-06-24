// DEX Executor - Real Uniswap V3 + AAVE Flash Loan trades
import { ethers } from 'ethers';

// Contract addresses (Ethereum mainnet)
const ADDRESSES = {
  UNISWAP_ROUTER: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  AAVE_POOL: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
  WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
};

// Uniswap V3 Router ABI (exactInputSingle)
const ROUTER_ABI = [
  'function exactInputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
  'function exactOutputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountIn)',
];

// ERC20 ABI (approve + decimals)
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function balanceOf(address account) external view returns (uint256)',
];

// AAVE Pool ABI (flash loan)
const AAVE_ABI = [
  'function flashLoanSimple(address receiver, address token, uint256 amount, bytes calldata params, uint16 referralCode) external',
];

const FEE_TIERS = {
  'ETH/USDC': 3000,   // 0.3%
  'BTC/USDC': 3000,
  'SOL/USDC': 3000,
  'BNB/USDC': 3000,
  'XRP/USDC': 3000,
  'KAS/USDC': 3000,
};

export class DEXExecutor {
  constructor(provider, wallet) {
    this.provider = provider;
    this.wallet = wallet;
    this.router = new ethers.Contract(ADDRESSES.UNISWAP_ROUTER, ROUTER_ABI, wallet);
    this.aavePool = new ethers.Contract(ADDRESSES.AAVE_POOL, AAVE_ABI, wallet);
  }

  getTokenAddress(pair) {
    const [base] = pair.split('/');
    const map = {
      'ETH': ADDRESSES.WETH,
      'BTC': ADDRESSES.WETH, // WBTC not implemented yet - use WETH as placeholder
      'SOL': ADDRESSES.USDC, // Alt tokens would go through CoinGecko price
      'BNB': ADDRESSES.USDC,
      'XRP': ADDRESSES.USDC,
      'KAS': ADDRESSES.USDC,
      'USDC': ADDRESSES.USDC,
    };
    return map[base] || ADDRESSES.USDC;
  }

  async getTokenContract(tokenAddress) {
    return new ethers.Contract(tokenAddress, ERC20_ABI, this.wallet);
  }

  async approveToken(tokenAddress, amount) {
    const token = await this.getTokenContract(tokenAddress);
    const allowance = await token.allowance(this.wallet.address, ADDRESSES.UNISWAP_ROUTER);
    if (allowance >= amount) return true;
    console.log(`[DEX] Approving ${ethers.formatUnits(amount, 6)} USDC for router...`);
    const tx = await token.approve(ADDRESSES.UNISWAP_ROUTER, ethers.MaxUint256);
    await tx.wait();
    console.log(`[DEX] Approval tx: ${tx.hash}`);
    return true;
  }

  async swapExactInput(pair, direction, amountUSDC, minOutputUSDC = 0) {
    try {
      const isBuy = direction === 'long'; // Buy = swap USDC -> WETH
      const tokenIn = isBuy ? ADDRESSES.USDC : ADDRESSES.WETH;
      const tokenOut = isBuy ? ADDRESSES.WETH : ADDRESSES.USDC;
      const fee = FEE_TIERS[pair] || 3000;
      
      // Approve router if swapping USDC
      if (isBuy) {
        const amountInWei = ethers.parseUnits(amountUSDC.toFixed(6), 6);
        await this.approveToken(tokenIn, amountInWei);
      }
      
      // Get signer balance for ETH wraps
      const amountInWei = isBuy
        ? ethers.parseUnits(amountUSDC.toFixed(6), 6)
        : ethers.parseEther(amountUSDC.toFixed(6)); // simplified - real would use WETH price

      const params = {
        tokenIn,
        tokenOut,
        fee,
        recipient: this.wallet.address,
        deadline: Math.floor(Date.now() / 1000) + 300,
        amountIn: amountInWei,
        amountOutMinimum: ethers.parseUnits(minOutputUSDC.toFixed(6), 6),
        sqrtPriceLimitX96: 0,
      };

      console.log(`[DEX] Executing swap: ${direction} ${pair} | amount: ${amountUSDC}`);
      const tx = await this.router.exactInputSingle(params, { gasLimit: 500000 });
      console.log(`[DEX] Swap tx sent: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`[DEX] Swap confirmed in block ${receipt.blockNumber}`);
      
      return { hash: tx.hash, blockNumber: receipt.blockNumber, success: true };
    } catch (err) {
      console.error(`[DEX] Swap failed:`, err.message);
      return { success: false, error: err.message };
    }
  }

  async executeFlashLoanTrade(pair, direction, amount, walletBalance) {
    // Phase 2: AAVE flash loan implementation
    console.log(`[DEX] Flash loan trade not yet implemented for ${pair}`);
    return { success: false, error: 'Flash loan not yet implemented' };
  }
}
