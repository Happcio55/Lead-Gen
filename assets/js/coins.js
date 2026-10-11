/* Memecoins tradable on Robinhood Crypto.
 * List + descriptions: robinhood.com/us/en/support/articles/coin-availability/ and robinhood.com/us/en/crypto/<SYM>/
 * Logos: official project artwork (via CoinGecko asset CDN), bundled locally in assets/logos/. */
window.COINS = [
  {
    "sym": "DOGE",
    "name": "Dogecoin",
    "cg": "dogecoin",
    "logo": "assets/logos/doge.png",
    "chain": "Dogecoin",
    "color": "#c9a227",
    "src": {
      "type": "coinbase",
      "id": "DOGE-USD"
    },
    "desc": "Dogecoin (DOGE) was founded by software engineers Billy Markus and Jackson Palmer, and was launched in 2013. Dogecoin was created to make digital currency more fun, friendly, and approachable. Similar to bitcoin, dogecoin is a digital currency that can be used for peer-to-peer transactions. There is currently no hard cap on the total supply of DOGE."
  },
  {
    "sym": "SHIB",
    "name": "Shiba Inu",
    "cg": "shiba-inu",
    "logo": "assets/logos/shib.png",
    "chain": "Ethereum",
    "color": "#d4793f",
    "src": {
      "type": "coinbase",
      "id": "SHIB-USD"
    },
    "desc": "Shiba Inu (SHIB) is an Ethereum-based token that was launched in August 2020."
  },
  {
    "sym": "PEPE",
    "name": "Pepe",
    "cg": "pepe",
    "logo": "assets/logos/pepe.jpeg",
    "chain": "Ethereum",
    "color": "#6f9a4a",
    "src": {
      "type": "coinbase",
      "id": "PEPE-USD"
    },
    "desc": "Pepe (PEPE) is a meme token that operates on the Ethereum blockchain. It was created as a tribute to the Pepe the Frog meme, which gained popularity in the 2000s. It differentiates itself by being transparent about its lack of utility, positioning itself purely as a meme token."
  },
  {
    "sym": "TRUMP",
    "name": "OFFICIAL TRUMP",
    "cg": "official-trump",
    "logo": "assets/logos/trump.png",
    "chain": "Solana",
    "color": "#b5452f",
    "src": {
      "type": "coinbase",
      "id": "TRUMP-USD"
    },
    "desc": "The OFFICIAL TRUMP token, also known as TRUMP, is a meme token that was launched in January 2025. According to GetTrumpMemes.com, 200 million TRUMP (20% of the supply) was available to the market at launch. CIC Digital LLC, an affiliate of The Trump Organization, and Fight Fight Fight LLC collectively own 80% of the remaining non-public supply, subject to a 3-year unlocking schedule."
  },
  {
    "sym": "PENGU",
    "name": "Pudgy Penguins",
    "cg": "pudgy-penguins",
    "logo": "assets/logos/pengu.png",
    "chain": "Solana",
    "color": "#7aa6b8",
    "src": {
      "type": "coinbase",
      "id": "PENGU-USD"
    },
    "desc": "PENGU is a meme token launched on Solana, inspired by Pudgy Penguins, a web3-born brand that produces content, merchandise, toys, and digital collectables. PENGU was launched in December 2024."
  },
  {
    "sym": "BONK",
    "name": "Bonk",
    "cg": "bonk",
    "logo": "assets/logos/bonk.jpg",
    "chain": "Solana",
    "color": "#e0a458",
    "src": {
      "type": "coinbase",
      "id": "BONK-USD"
    },
    "desc": "Bonk (BONK) is a token built on the Solana blockchain that was initially airdropped to select Solana wallets in December 2022."
  },
  {
    "sym": "FLOKI",
    "name": "Floki",
    "cg": "floki",
    "logo": "assets/logos/floki.png",
    "chain": "Ethereum",
    "color": "#a3593a",
    "src": {
      "type": "coinbase",
      "id": "FLOKI-USD"
    },
    "desc": "FLOKI is the utility token of the Floki ecosystem, which includes Valhalla (an NFT metaverse game), FlokiFi Locker (a DeFi asset locking protocol), University of Floki (a crypto education platform), a debit card, and more."
  },
  {
    "sym": "WIF",
    "name": "dogwifhat",
    "cg": "dogwifcoin",
    "logo": "assets/logos/wif.jpg",
    "chain": "Solana",
    "color": "#8a6d4b",
    "src": {
      "type": "coinbase",
      "id": "WIF-USD"
    },
    "desc": "Launched in December 2023 by anonymous creators, dogwifhat (WIF) is a Solana-based token with a maximum supply of 998.9 million tokens."
  },
  {
    "sym": "CASHCAT",
    "name": "Cash Cat",
    "cg": "cash-cat",
    "logo": "assets/logos/cashcat.jpg",
    "chain": "Robinhood Chain",
    "color": "#9c7bb0",
    "src": {
      "type": "dex",
      "chain": "robinhood",
      "pair": "0xd42A491087a15E5afd51FEb3606066Cc152d2b09"
    },
    "desc": "CashCat (CASHCAT) is a memecoin on Robinhood Chain, a permissionless, Ethereum-compatible, Layer-2 blockchain. The token has no intrinsic utility, and its value is driven by community sentiment."
  },
  {
    "sym": "PNUT",
    "name": "Peanut the Squirrel",
    "cg": "peanut-the-squirrel",
    "logo": "assets/logos/pnut.png",
    "chain": "Solana",
    "color": "#c2884f",
    "src": {
      "type": "coinbase",
      "id": "PNUT-USD"
    },
    "desc": "PNUT is a meme token launched on Solana, inspired by Peanut the Squirrel. PNUT was launched in November 2024."
  },
  {
    "sym": "POPCAT",
    "name": "Popcat",
    "cg": "popcat",
    "logo": "assets/logos/popcat.jpg",
    "chain": "Solana",
    "color": "#d9b26f",
    "src": {
      "type": "coinbase",
      "id": "POPCAT-USD"
    },
    "desc": "POPCAT is a meme token launched on Solana, inspired by the internet meme of a cat named Oatmeal that originated in October 2020. POPCAT was launched in December 2023."
  },
  {
    "sym": "MOODENG",
    "name": "Moo Deng",
    "cg": "moo-deng",
    "logo": "assets/logos/moodeng.jpg",
    "chain": "Solana",
    "color": "#5f8f7a",
    "src": {
      "type": "coinbase",
      "id": "MOODENG-USD"
    },
    "desc": "MOODENG is a meme token launched on Solana, inspired by a pygmy hippopotamus living in Khao Kheow Open Zoo in Si Racha, Chonburi, Thailand. MOODENG was launched in September 2024."
  },
  {
    "sym": "MEW",
    "name": "cat in a dogs world",
    "cg": "cat-in-a-dogs-world",
    "logo": "assets/logos/mew.png",
    "chain": "Solana",
    "color": "#b07c6e",
    "src": {
      "type": "kraken",
      "id": "MEW/USD",
      "rest": "MEWUSD"
    },
    "desc": "MEW is a meme token launched on Solana, inspired by a cat named MEW, who is alone in a world ruled by dogs. MEW was launched in March 2024."
  }
];
