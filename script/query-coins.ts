import dotenv from "dotenv";
dotenv.config();

import axios from "axios";
import { readFileSync, writeFileSync } from "fs";
import { lz_coin_infos, wormhole_coin_infos } from "./wormhole_coin_infos";


export interface CoinInfo {
  name: string;
  decimals: number;
  symbol: string;
  coin_type: string;
  price: number;
  approximateOffset_lt0?: number;
  approximateOffset_0U?: number;
  approximateOffset_5U?: number;
  approximateOffset_10U?: number;
  updateTime?: string
}

const endpoint = "https://indexer.mainnet.aptoslabs.com/v1/graphql";
const headers = {
  "content-type": "application/json",
  authority: "indexer.mainnet.aptoslabs.com",
};

async function saveAmountFile(coinAmounts: AmountResult[]) {
  writeFileSync('data/coin_account_amount.json', JSON.stringify(coinAmounts,  undefined, 4));
}

async function readAmountFile(): Promise<AmountResult[]> {
  var dataArray = JSON.parse(readFileSync('data/coin_account_amount.json', 'utf-8')) as AmountResult[]
  return dataArray;
}

(async () => {
  let coinAccountInfo = await readAmountFile()

  try {
    let rs:CoinResult[] = []
    const coinInfoCollection = process.env.Coins ?? "layerzero";
    let infos = coinInfoCollection == "layerzero" ? lz_coin_infos : wormhole_coin_infos;
    let targetProtocol = infos == wormhole_coin_infos ? 'wormhole coin accounts data' : 'layerzero coin accounts data'

    // let infos = [wormhole_coin_infos[0]] // test
    // let coinInfo = infos[0]
    // let amountActive = await getFinalAmountAuto(coinInfo, -1, coinInfo.approximateOffset_lt0 ? coinInfo.approximateOffset_lt0!*2-2 : 100);
    // console.log('xxx ', amountActive)
    // return

    infos = infos.map(item => {
      let coinAccounts = coinAccountInfo.filter(coinRsItem => coinRsItem.coinType == item.coin_type)
      if(coinAccounts.length > 0) {
        const coinAccount = coinAccounts[0]
        item.approximateOffset_lt0 = coinAccount.registered_accounts
        item.approximateOffset_0U = coinAccount.greater_than_0
        item.approximateOffset_5U = coinAccount.greater_than_5U
        item.approximateOffset_10U = coinAccount.greater_than_10U
        item.updateTime = coinAccount.updateTime
      } else {
        // add to data record
        coinAccountInfo.push({
          coinType: item.coin_type,
          name: item.name,
          symbol: item.symbol,
          decimals: item.decimals
        })
      }
      return item
    })

    for(let i =0; i<infos.length; i++) {
      // let coinInfo = wormhole_coin_infos[i]
      let coinInfo = infos[i]
      let coinAmountInfo = coinAccountInfo.filter(item => item.coinType == coinInfo.coin_type)[0]

      let lastUpdateTime = coinAmountInfo.updateTime ? Date.parse(coinAmountInfo.updateTime!) : 0
      // cache 30 minutes
      if(Date.now() - lastUpdateTime > 30*60*1000) {  
        // let amountActive = 0;
        let amountActive = await getFinalAmountAuto(coinInfo, -1, coinInfo.approximateOffset_lt0 ? coinInfo.approximateOffset_lt0!*2-2 : 40);
        let amountGt0 = await getFinalAmountAuto(coinInfo, 0, coinInfo.approximateOffset_0U ? coinInfo.approximateOffset_0U!*2-2 :40);
        // let amount5U = 0;
        // let amount5U = await getFinalAmountAuto(coinInfo, 5, coinInfo.approximateOffset_5U ? coinInfo.approximateOffset_5U*2-2 : 40);
        let amount10U = await getFinalAmountAuto(coinInfo, 10, coinInfo.approximateOffset_10U ? coinInfo.approximateOffset_10U!*2-2 : 40);
        // let amount10U = 0

        // update cache
        for(let item of coinAccountInfo) {
          if(item.coinType == coinInfo.coin_type) {
            item.registered_accounts = amountActive
            item.greater_than_0 = amountGt0
            // item.greater_than_5U = amount5U
            item.greater_than_10U = amount10U
            item.updateTime = new Date(Date.now()).toISOString()
          }
        }
      }

      // present
      let r:CoinResult =  {
        name: `${coinInfo.name}(${coinInfo.symbol})`,
        registered_accounts: coinAmountInfo.registered_accounts,
        gt_0_accounts: coinAmountInfo.greater_than_0,
        // greater_than_5U: coinAmountInfo.greater_than_5U,
        gt_10U_accounts: coinAmountInfo.greater_than_10U
      }
      rs.push(r)
    }
    console.log()
    console.log(targetProtocol)
    console.table(rs)
    console.log()
  } catch(e) {
    console.error(e)
  }

  await saveAmountFile(coinAccountInfo)

})();

interface CoinResult {
  name: string
  registered_accounts?: number
  gt_0_accounts?: number,
  // greater_than_5U?: number,
  gt_10U_accounts?: number,
}

interface AmountResult {
  coinType: string
  name: string;
  decimals: number;
  symbol: string;
  registered_accounts?: number
  greater_than_0?: number,
  greater_than_5U?: number,
  greater_than_10U?: number,
  updateTime?: string
}

function float2int (value: number) {
  return value | 0;
}

/// bug in https://indexer.mainnet.aptoslabs.com/v1/graphql???  limit only work on 20.
async function getFinalAmountAuto(coinInfo: CoinInfo, checkUSD: number, right:number=20, limit:number=20) {
  let offset = 0;
  let left = 0;
  let checkAmount = 10**coinInfo.decimals * checkUSD / coinInfo.price
  let itemAmount = 0;
  let canExpand = true;
  while (true) {
    offset = float2int((left + right) / 2)
    if(right - offset < limit) {
      offset = right - limit
      if(offset < left) {
        offset = left
      }
    } else if(offset - left < limit) {
      offset = left + limit
      if(offset > right) {
        offset = right
      }
    }

    console.log('left', left, 'right', right)

    itemAmount = await getAmount(coinInfo, checkAmount, offset, limit);
    if(itemAmount < limit && itemAmount > 0) {
      return offset + itemAmount
    }

    if(right - left <= limit && !canExpand) {
      return offset + itemAmount
    }

    if(itemAmount == 0) { // in the left
      right = offset + 1
      canExpand = false
    } else if(itemAmount == limit) { // in right
      left = left  < offset - 1 ? offset - 1 : left
      if(canExpand) {
        right = Math.max(right*2, offset + limit + 1)
      } 
    } else {
      throw 'will not come here'
    }
  }
}

async function getAmount(
  coinInfo: CoinInfo,
  checkAmount: number,
  offset: number,
  limit: number,
): Promise<number> {
  // await delay(200);
  // let mockAmount = 0
  // if(mockAmount > offset && mockAmount < offset + limit) {
  //   console.log('----bingo. amount, offset', mockAmount, offset)
  //   return mockAmount - offset;
  // }
  // if(mockAmount >= offset + limit) {
  //   console.log('----have more. amount, offset', mockAmount, offset)
  //   return limit
  // }
  // if(mockAmount <= offset) {
  //   console.log('----have pass. amount, offset', mockAmount, offset)
  //   return 0
  // }
  // console.log('----@@@@@');
  // return 0

  let prStr = `
  query coinsBalance {
    current_coin_balances(
      where: {
  `
  let amountStr = `amount: {_gt: ${checkAmount}}, `
  let pStr = `
      coin_type: {_eq: "${coinInfo.coin_type}"}},
      offset: ${offset},
      limit: ${limit},
    ) {
      amount
    }
  }
  `

  let queryStr = prStr
  if(checkAmount >= 0) {
    queryStr += amountStr
  }
  queryStr += pStr

  // console.log(queryStr)
  
  await delay(200);

  const coinQuery = {
    operationName: "coinsBalance",
    query: queryStr,
    variables: {},
  };
  const response = await axios({
    url: endpoint,
    method: "post",
    headers: headers,
    data: coinQuery,
  });

  // console.log(response.data)
  return response.data.data.current_coin_balances.length as number;
  // console.log(response.data.data.current_coin_balances); // data
}

function delay(ms: number) {
  return new Promise( resolve => setTimeout(resolve, ms) );
}
