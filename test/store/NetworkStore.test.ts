import { Wallet } from 'ethers'
import { Waku } from 'js-waku'

import { newWallet, sleep } from '../helpers'
import { createWaku } from '../../src/Client'
import { NetworkStore } from '../../src/store'
import { buildUserPrivateStoreTopic } from '../../src/utils'

const newLocalDockerWaku = (): Promise<Waku> =>
  createWaku({
    bootstrapAddrs: [
      '/ip4/127.0.0.1/tcp/9001/ws/p2p/16Uiu2HAmNCxLZCkXNbpVPBpSSnHj9iq4HZQj7fxRzw2kj1kKSHHA',
    ],
  })

const newTestnetWaku = (): Promise<Waku> => createWaku({ env: 'testnet' })

describe('NetworkStore', () => {
  jest.setTimeout(10000)
  const tests = [
    {
      name: 'local docker node',
      newWaku: newLocalDockerWaku,
    },
  ]
  if (process.env.CI || process.env.TESTNET) {
    tests.push({
      name: 'testnet',
      newWaku: newTestnetWaku,
    })
  }
  tests.forEach((testCase) => {
    describe(testCase.name, () => {
      let waku: Waku
      let wallet: Wallet
      let store: NetworkStore
      beforeAll(async () => {
        waku = await testCase.newWaku()
      })
      afterAll(async () => {
        if (waku) await waku.stop()
      })

      beforeEach(async () => {
        wallet = newWallet()
        store = new NetworkStore(waku, buildUserPrivateStoreTopic)
      })

      it('roundtrip', async () => {
        const key = wallet.address

        const value = new TextEncoder().encode('hello')
        const empty = await store.get(key)
        expect(empty).toBeNull()

        await store.set(key, Buffer.from(value))
        const full = await store.get(key)

        expect(full).toBeDefined()
        expect(full).toEqual(Buffer.from(value))
      })

      it('distinct topics', async () => {
        const valueA = Buffer.from(new TextEncoder().encode('helloA'))
        const valueB = Buffer.from(new TextEncoder().encode('helloB'))
        const keyA = wallet.address + 'A'
        const keyB = wallet.address + 'B'

        store.set(keyA, valueA)
        store.set(keyB, valueB)
        const responseA = await store.get(keyA)
        const responseB = await store.get(keyB)

        expect(responseA).toEqual(valueA)
        expect(responseB).toEqual(valueB)
        expect(responseA).not.toEqual(responseB)
      })

      it('over write safety', async () => {
        const key = wallet.address

        const first_value = new TextEncoder().encode('a')
        const second_value = new TextEncoder().encode('bb')

        await store.set(key, Buffer.from(first_value))
        await sleep(10) // Add wait to enforce a consistent order of messages
        await store.set(key, Buffer.from(second_value))
        await sleep(10) // Add wait to enforce a consistent order of messages
        const returned_value = await store.get(key)

        expect(returned_value).toEqual(Buffer.from(first_value))
      })
    })
  })
})
