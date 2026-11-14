"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getBalance } from "./adapter";
import type { TxRequest } from "./adapter";

export interface WalletState {
  accountId: string | null;
  /** yoctoNEAR on testnet, or null while loading / unknown. */
  balanceRaw: string | null;
  /** Set when the account cannot be used on testnet. Staking is disabled while this is set. */
  networkProblem: string | null;
  connecting: boolean;
  error: string | null;
}

type Connector = import("@hot-labs/near-connect").NearConnector;

/**
 * Testnet-only wallet. The connector library is loaded on demand, so no page needs it to render.
 */
export function useWallet() {
  const [state, setState] = useState<WalletState>({ accountId: null, balanceRaw: null, networkProblem: null, connecting: false, error: null });
  const connector = useRef<Connector | null>(null);

  const setAccount = useCallback(async (accountId: string | null) => {
    if (!accountId) {
      setState({ accountId: null, balanceRaw: null, networkProblem: null, connecting: false, error: null });
      return;
    }
    const mainnet = accountId.endsWith(".near") || accountId.endsWith(".tg");
    setState({
      accountId,
      balanceRaw: null,
      networkProblem: mainnet ? "This wallet is on mainnet. Litmus runs on testnet, so staking is off." : null,
      connecting: false,
      error: null,
    });
    if (mainnet) return;
    try {
      const balanceRaw = await getBalance(accountId);
      setState((s) => (s.accountId === accountId ? { ...s, balanceRaw } : s));
    } catch {
      setState((s) => (s.accountId === accountId ? { ...s, networkProblem: "This account was not found on testnet. Switch your wallet to testnet to stake." } : s));
    }
  }, []);

  const getConnector = useCallback(async () => {
    if (connector.current) return connector.current;
    const { NearConnector } = await import("@hot-labs/near-connect");
    const c = new NearConnector({ network: "testnet" });
    c.on("wallet:signIn", (e) => void setAccount(e.accounts[0]?.accountId ?? null));
    c.on("wallet:signOut", () => void setAccount(null));
    connector.current = c;
    return c;
  }, [setAccount]);

  // Restore an earlier session, if there was one. Skipped entirely for first-time visitors.
  useEffect(() => {
    let had = false;
    try {
      had = localStorage.getItem("litmus-wallet") === "1";
    } catch {
      /* storage blocked */
    }
    if (!had) return;
    void (async () => {
      try {
        const c = await getConnector();
        const { accounts } = await c.getConnectedWallet();
        await setAccount(accounts[0]?.accountId ?? null);
      } catch {
        /* no earlier session */
      }
    })();
  }, [getConnector, setAccount]);

  const remember = (on: boolean) => {
    try {
      if (on) localStorage.setItem("litmus-wallet", "1");
      else localStorage.removeItem("litmus-wallet");
    } catch {
      /* storage blocked */
    }
  };

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, connecting: true, error: null }));
    try {
      const c = await getConnector();
      const w = await c.connect();
      const accounts = await w.getAccounts();
      remember(true);
      await setAccount(accounts[0]?.accountId ?? null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setState((s) => ({ ...s, connecting: false, error: /reject|cancel|closed/i.test(msg) || !msg ? null : msg }));
    }
  }, [getConnector, setAccount]);

  const disconnect = useCallback(async () => {
    remember(false);
    try {
      await (await getConnector()).disconnect();
    } catch {
      /* already gone */
    }
    await setAccount(null);
  }, [getConnector, setAccount]);

  const send = useCallback(
    async (req: TxRequest) => {
      const w = await (await getConnector()).wallet();
      const out = await w.signAndSendTransaction({ network: "testnet", ...req });
      const accountId = state.accountId;
      if (accountId) void getBalance(accountId).then((balanceRaw) => setState((s) => (s.accountId === accountId ? { ...s, balanceRaw } : s))).catch(() => {});
      return out;
    },
    [getConnector, state.accountId],
  );

  return { wallet: state, connect, disconnect, send };
}

export type Wallet = ReturnType<typeof useWallet>;
