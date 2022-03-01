import { Trans } from '@lingui/macro'
import { Token } from '@uniswap/sdk-core'
import { useUpdateAtom } from 'jotai/utils'
import { useSwapCurrencyAmount, useSwapInfo, useSwapTradeType } from 'lib/hooks/swap'
import {
  useApproveAndPermit,
  useSwapApprovalOptimizedTrade,
  useSwapRouterAddress,
} from 'lib/hooks/swap/useSwapApproval'
import { useSwapCallback } from 'lib/hooks/swap/useSwapCallback'
import { useAddTransaction, usePendingApproval } from 'lib/hooks/transactions'
import useActiveWeb3React from 'lib/hooks/useActiveWeb3React'
import useTransactionDeadline from 'lib/hooks/useTransactionDeadline'
import { Spinner } from 'lib/icons'
import { displayTxHashAtom, Field } from 'lib/state/swap'
import { TransactionType } from 'lib/state/transactions'
import { useTheme } from 'lib/theme'
import { useCallback, useEffect, useMemo, useState } from 'react'
import invariant from 'tiny-invariant'
import { ExplorerDataType } from 'utils/getExplorerLink'

import ActionButton, { ActionButtonProps } from '../ActionButton'
import Dialog from '../Dialog'
import EtherscanLink from '../EtherscanLink'
import { SummaryDialog } from './Summary'

interface SwapButtonProps {
  disabled?: boolean
}

function useIsPendingApproval(token?: Token, spender?: string): boolean {
  return Boolean(usePendingApproval(token, spender))
}

export default function SwapButton({ disabled }: SwapButtonProps) {
  const { account, chainId } = useActiveWeb3React()

  const { tokenColorExtraction } = useTheme()

  const {
    trade,
    allowedSlippage,
    currencies: { [Field.INPUT]: inputCurrency },
    currencyBalances: { [Field.INPUT]: inputCurrencyBalance },
    currencyAmounts: { [Field.INPUT]: inputCurrencyAmount, [Field.OUTPUT]: outputCurrencyAmount },
    feeOptions,
  } = useSwapInfo()

  const tradeType = useSwapTradeType()

  const [activeTrade, setActiveTrade] = useState<typeof trade.trade | undefined>()
  useEffect(() => {
    setActiveTrade((activeTrade) => activeTrade && trade.trade)
  }, [trade])

  // TODO(zzmp): Return an optimized trade directly from useSwapInfo.
  const optimizedTrade =
    // Use trade.trade if there is no swap optimized trade. This occurs if approvals are still pending.
    useSwapApprovalOptimizedTrade(trade.trade, allowedSlippage, useIsPendingApproval) || trade.trade

  const approvalCurrencyAmount = useSwapCurrencyAmount(Field.INPUT)

  const { notApproved, pendingApproval, loadingSignature, supportsPermit, signatureData, handleApproveOrPermit } =
    useApproveAndPermit(optimizedTrade, allowedSlippage, useIsPendingApproval, approvalCurrencyAmount)

  const approvalHash = usePendingApproval(
    inputCurrency?.isToken ? inputCurrency : undefined,
    useSwapRouterAddress(optimizedTrade)
  )

  const addTransaction = useAddTransaction()
  const deadline = useTransactionDeadline()

  const actionProps = useMemo((): Partial<ActionButtonProps> | undefined => {
    if (
      disabled ||
      !chainId ||
      loadingSignature ||
      (inputCurrencyAmount && inputCurrencyBalance && inputCurrencyBalance.lessThan(inputCurrencyAmount))
    ) {
      return { disabled: true }
    }
    if (notApproved) {
      const currency = inputCurrency || approvalCurrencyAmount?.currency
      invariant(currency)
      return {
        action: {
          message: supportsPermit ? (
            <Trans>Allow {currency.symbol} first</Trans>
          ) : (
            <Trans>Approve {currency.symbol} first</Trans>
          ),
          onClick: handleApproveOrPermit,
          children: supportsPermit ? <Trans>Allow</Trans> : <Trans>Approve</Trans>,
        },
      }
    }
    if (pendingApproval) {
      return {
        disabled: true,
        action: {
          message: (
            <EtherscanLink type={ExplorerDataType.TRANSACTION} data={approvalHash}>
              <Trans>Approval pending</Trans>
            </EtherscanLink>
          ),
          icon: Spinner,
          onClick: handleApproveOrPermit,
          children: <Trans>Approve</Trans>,
        },
      }
    }
    return {}
  }, [
    approvalCurrencyAmount?.currency,
    approvalHash,
    chainId,
    disabled,
    handleApproveOrPermit,
    inputCurrency,
    inputCurrencyAmount,
    inputCurrencyBalance,
    loadingSignature,
    notApproved,
    pendingApproval,
    supportsPermit,
  ])

  // the callback to execute the swap
  const { callback: swapCallback } = useSwapCallback({
    trade: optimizedTrade,
    allowedSlippage,
    recipientAddressOrName: account ?? null,
    signatureData,
    deadline,
    feeOptions,
  })

  //@TODO(ianlapham): add a loading state, process errors
  const setDisplayTxHash = useUpdateAtom(displayTxHashAtom)

  const onConfirm = useCallback(() => {
    swapCallback?.()
      .then((response) => {
        setDisplayTxHash(response.hash)
        invariant(inputCurrencyAmount && outputCurrencyAmount)
        addTransaction({
          response,
          type: TransactionType.SWAP,
          tradeType,
          inputCurrencyAmount,
          outputCurrencyAmount,
        })
      })
      .catch((error) => {
        //@TODO(ianlapham): add error handling
        console.log(error)
      })
      .finally(() => {
        setActiveTrade(undefined)
      })
  }, [addTransaction, inputCurrencyAmount, outputCurrencyAmount, setDisplayTxHash, swapCallback, tradeType])

  return (
    <>
      <ActionButton
        color={tokenColorExtraction ? 'interactive' : 'accent'}
        onClick={() => setActiveTrade(trade.trade)}
        {...actionProps}
      >
        <Trans>Review swap</Trans>
      </ActionButton>
      {activeTrade && (
        <Dialog color="dialog" onClose={() => setActiveTrade(undefined)}>
          <SummaryDialog trade={activeTrade} allowedSlippage={allowedSlippage} onConfirm={onConfirm} />
        </Dialog>
      )}
    </>
  )
}
