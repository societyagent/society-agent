// Reown AppKit — loaded lazily (only when someone signs in), so the landing page stays light.
// createAppKit runs at module scope on purpose: it must exist before any AppKit call.
import { createAppKit } from '@reown/appkit'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { baseAccount, coinbaseWallet } from 'wagmi/connectors'
import { mainnet } from '@reown/appkit/networks'

export const PROJECT_ID = (import.meta.env.VITE_REOWN_PROJECT_ID as string | undefined)?.trim() ?? ''
if (!PROJECT_ID) throw new Error('VITE_REOWN_PROJECT_ID is not set')

const networks: [typeof mainnet] = [mainnet] // Sign-in only: the chain id is just part of the SIWE message, no transactions are ever sent.
// Coinbase Wallet and Base Account are offered, but with their telemetry switched off. By default these SDKs inject a third-party
// analytics script as inline code, which a strict Content-Security-Policy (script-src 'self') correctly refuses. AppKit only adds its
// own copies of these connectors when none is registered, and it does not pass `telemetry: false`, so we register them ourselves.
const connectors = [
  baseAccount({ appName: 'Society Agent', preference: { telemetry: false } }),
  coinbaseWallet({ appName: 'Society Agent', preference: { options: 'all', telemetry: false } }),
]
const wagmiAdapter = new WagmiAdapter({ networks, projectId: PROJECT_ID, ssr: false, connectors })

export const appKit = createAppKit({
  adapters: [wagmiAdapter], networks, projectId: PROJECT_ID, defaultNetwork: mainnet,
  metadata: { name: 'Society Agent', description: 'Agent-based town simulation', url: window.location.origin, icons: [`${window.location.origin}/favicon.png`] },
  themeMode: 'dark',
  themeVariables: { '--w3m-accent': '#ff9a62', '--w3m-font-family': '"DM Sans Variable", system-ui, sans-serif', '--w3m-border-radius-master': '2px' },
  features: { analytics: false, email: false, socials: false, onramp: false, swaps: false },
})

export interface Eip1193 { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> }
const cancelled = () => Object.assign(new Error('Wallet connection cancelled'), { code: 4001 })

/** Open the Reown modal if needed and resolve with the connected account + its EIP-1193 provider. */
export async function connectWallet(): Promise<{ provider: Eip1193; address: string; chainId: number }> {
  if (!appKit.getAddress()) {
    await new Promise<void>((resolve, reject) => {
      let stopAccount: () => void = () => {}, stopState: () => void = () => {}
      const finish = (fn: () => void) => { stopAccount(); stopState(); fn() }
      stopAccount = appKit.subscribeAccount((a) => { if (a.isConnected && a.address) finish(resolve) })
      stopState = appKit.subscribeState((s) => { if (!s.open) setTimeout(() => { if (!appKit.getAddress()) finish(() => reject(cancelled())) }, 600) })
      void appKit.open()
    })
  }
  const address = appKit.getAddress(), provider = appKit.getWalletProvider() as Eip1193 | undefined
  if (!address || !provider) throw new Error('Wallet connected, but no signing provider was returned. Try again.')
  const id = Number(appKit.getChainId() ?? 1)
  return { provider, address, chainId: Number.isInteger(id) && id > 0 ? id : 1 }
}

export const disconnectWallet = () => appKit.disconnect()
