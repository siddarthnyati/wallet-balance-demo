// Portfolio Move — balance checker: chains, tokens, prices and zerohash listing.
// Every contract address below comes from the issuer's or chain's own docs (see README),
// and was checked onchain on 6 Nov 2026: symbol() and decimals() match.
//
// zh = what zerohash's public production docs say (US entity, checked 6 Nov 2026):
//   status "listed"   -> the asset and network appear in docs.zerohash.com production lists
//   status "unknown"  -> the symbol is listed, but zerohash doesn't publish which contract it means
//   status "absent"   -> this asset on this network is not in the production lists
// "Listed" never means a given Platform has it switched on: each Platform enables
// provider x asset x network itself.

window.PM_CONFIG = {
  chains: [
    {
      id: 'ethereum', name: 'Ethereum', chainId: 1,
      rpcs: ['https://ethereum-rpc.publicnode.com', 'https://cloudflare-eth.com', 'https://eth.drpc.org'],
      explorer: 'https://etherscan.io',
      native: { symbol: 'ETH', decimals: 18, price: 'ethereum',
        zh: { status: 'listed', symbol: 'ETH' } },
      tokens: [
        { symbol: 'USDC', decimals: 6, price: 'usd-coin', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          zh: { status: 'listed', symbol: 'USDC.ETH' } },
        { symbol: 'USDT', decimals: 6, price: 'tether', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
          zh: { status: 'listed', symbol: 'USDT.ETH' } },
        { symbol: 'WETH', decimals: 18, price: 'weth', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          zh: { status: 'listed', symbol: 'WETH.ETH' } },
        { symbol: 'WBTC', decimals: 8, price: 'wrapped-bitcoin', address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
          zh: { status: 'listed', symbol: 'WBTC.ETH' } },
        { symbol: 'LINK', decimals: 18, price: 'chainlink', address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
          zh: { status: 'listed', symbol: 'LINK.ETH' } },
      ],
    },
    {
      id: 'base', name: 'Base', chainId: 8453,
      rpcs: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com'],
      explorer: 'https://basescan.org',
      native: { symbol: 'ETH', decimals: 18, price: 'ethereum',
        zh: { status: 'listed', symbol: 'ETH.BASE' } },
      tokens: [
        { symbol: 'USDC', decimals: 6, price: 'usd-coin', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          zh: { status: 'listed', symbol: 'USDC.BASE' } },
        { symbol: 'WETH', decimals: 18, price: 'weth', address: '0x4200000000000000000000000000000000000006',
          zh: { status: 'absent', note: 'zerohash lists ETH on Base, not WETH on Base. Unwrap first.' } },
      ],
    },
    {
      id: 'arbitrum', name: 'Arbitrum One', chainId: 42161,
      rpcs: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum-one-rpc.publicnode.com'],
      explorer: 'https://arbiscan.io',
      native: { symbol: 'ETH', decimals: 18, price: 'ethereum',
        zh: { status: 'listed', symbol: 'ETH.ARBITRUM' } },
      tokens: [
        { symbol: 'USDC', decimals: 6, price: 'usd-coin', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
          zh: { status: 'listed', symbol: 'USDC.ARBITRUM' } },
        { symbol: 'USDT0', decimals: 6, price: 'tether', address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
          zh: { status: 'unknown', symbol: 'USDT.ARBITRUM', note: 'zerohash lists USDT.ARBITRUM but doesn’t publish the contract.' } },
        { symbol: 'WETH', decimals: 18, price: 'weth', address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
          zh: { status: 'absent', note: 'zerohash lists ETH on Arbitrum, not WETH on Arbitrum. Unwrap first.' } },
        { symbol: 'ARB', decimals: 18, price: 'arbitrum', address: '0x912CE59144191C1204E64559FE8253a0e49E6548',
          zh: { status: 'listed', symbol: 'ARB.ARBITRUM' } },
      ],
    },
    {
      id: 'optimism', name: 'OP Mainnet', chainId: 10,
      rpcs: ['https://mainnet.optimism.io', 'https://optimism-rpc.publicnode.com'],
      explorer: 'https://optimistic.etherscan.io',
      native: { symbol: 'ETH', decimals: 18, price: 'ethereum',
        zh: { status: 'listed', symbol: 'ETH.OPTIMISM' } },
      tokens: [
        { symbol: 'USDC', decimals: 6, price: 'usd-coin', address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
          zh: { status: 'listed', symbol: 'USDC.OPTIMISM' } },
        { symbol: 'USDT0', decimals: 6, price: 'tether', address: '0x01bFF41798a0BcF287b996046Ca68b395DbC1071',
          zh: { status: 'unknown', symbol: 'USDT.OPTIMISM', note: 'zerohash lists USDT.OPTIMISM but doesn’t publish the contract.' } },
        { symbol: 'WETH', decimals: 18, price: 'weth', address: '0x4200000000000000000000000000000000000006',
          zh: { status: 'absent', note: 'zerohash lists ETH on OP Mainnet, not WETH. Unwrap first.' } },
        { symbol: 'OP', decimals: 18, price: 'optimism', address: '0x4200000000000000000000000000000000000042',
          zh: { status: 'listed', symbol: 'OP.OPTIMISM' } },
      ],
    },
    {
      id: 'polygon', name: 'Polygon PoS', chainId: 137,
      rpcs: ['https://polygon-bor-rpc.publicnode.com', 'https://polygon.drpc.org', 'https://1rpc.io/matic'],
      explorer: 'https://polygonscan.com',
      native: { symbol: 'POL', decimals: 18, price: 'polygon-ecosystem-token',
        zh: { status: 'listed', symbol: 'MATIC.POLYGON', note: 'zerohash lists “Polygon (Native)” under the old ticker MATIC.POLYGON.' } },
      tokens: [
        { symbol: 'USDC', decimals: 6, price: 'usd-coin', address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
          zh: { status: 'listed', symbol: 'USDC.POLYGON' } },
        { symbol: 'USDT0', decimals: 6, price: 'tether', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
          zh: { status: 'unknown', symbol: 'USDT.POLYGON', note: 'zerohash lists USDT.POLYGON but doesn’t publish the contract.' } },
        { symbol: 'WETH', decimals: 18, price: 'weth', address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
          zh: { status: 'unknown', symbol: 'WETH.POLYGON', note: 'zerohash lists WETH.POLYGON but doesn’t publish the contract.' } },
        { symbol: 'WBTC', decimals: 8, price: 'wrapped-bitcoin', address: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
          zh: { status: 'absent', note: 'zerohash lists WBTC on Ethereum only.' } },
      ],
    },
    {
      id: 'avalanche', name: 'Avalanche C-Chain', chainId: 43114,
      rpcs: ['https://api.avax.network/ext/bc/C/rpc', 'https://avalanche-c-chain-rpc.publicnode.com'],
      explorer: 'https://snowtrace.io',
      native: { symbol: 'AVAX', decimals: 18, price: 'avalanche-2',
        zh: { status: 'listed', symbol: 'AVAX' } },
      tokens: [
        { symbol: 'USDC', decimals: 6, price: 'usd-coin', address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
          zh: { status: 'listed', symbol: 'USDC.AVAX' } },
        { symbol: 'USDT', decimals: 6, price: 'tether', address: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
          zh: { status: 'listed', symbol: 'USDT.AVAX' } },
      ],
    },
    // ---- Non-EVM. Read with their own APIs; addresses come from the wallet's Solana / Bitcoin accounts. ----
    {
      id: 'solana', type: 'solana', name: 'Solana',
      rpcs: ['https://solana-rpc.publicnode.com', 'https://solana.publicnode.com'],
      explorer: 'https://solscan.io',
      native: { symbol: 'SOL', decimals: 9, price: 'solana',
        zh: { status: 'listed', symbol: 'SOL' } },
      tokens: [
        // Mints: Circle (USDC) and Tether (USDT) official pages; both checked onchain (SPL mint, 6 decimals).
        { symbol: 'USDC', decimals: 6, price: 'usd-coin', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          zh: { status: 'listed', symbol: 'USDC.SOL' } },
        { symbol: 'USDT', decimals: 6, price: 'tether', mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
          zh: { status: 'listed', symbol: 'USDT.SOL' } },
      ],
    },
    {
      id: 'bitcoin', type: 'bitcoin', name: 'Bitcoin',
      apis: ['https://mempool.space/api', 'https://blockstream.info/api'],
      explorer: 'https://mempool.space',
      native: { symbol: 'BTC', decimals: 8, price: 'bitcoin',
        zh: { status: 'listed', symbol: 'BTC' } },
      tokens: [],
    },
  ],
  priceApi: 'https://api.coingecko.com/api/v3/simple/price',
};
