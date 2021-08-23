import "mocha" // using @types/mocha
import { expect } from "chai"
import { MiniMeProof, EthProof } from "../../src/index"
import { checkMiniMeKeys, getArraySize, getCheckPointAtPosition, parseCheckPointValue } from "../../src/minime"
import { MINIME_ABI } from "../../src/abi/erc"
import { provider } from "../util"
import { addCompletionHooks } from "../mocha-hooks"
import { BigNumber, Contract } from "ethers"
import { StorageProof } from "../../src/types"

addCompletionHooks()

describe('MiniMe Storage Proofs', () => {
  const TOKEN_ADDRESS = "0x4d98039ab1bfd7b7a7d6f0629bebb7aefd36286e"
  const TOKEN_HOLDERS = [
    "0xa059fc472c7fac3a939664a215d6948d5c85f502",
    "0x78ab05fb88d580b83ca4f90aca6056498b69747a",
    "0xe5818d70a9b5aed2bfde4e41fbcb07dd80f8fc84",
    "0xd7aa78bb243d5420717885af9703295f37e2dafd"
  ]
  const MAP_INDEX_SLOT = 8

  it("Should discover the checkpoints map slot", async () => {
    const slot = await MiniMeProof.findMapSlot(TOKEN_ADDRESS, TOKEN_HOLDERS[0], provider)

    expect(typeof slot).to.eq("number")
    expect(slot).to.be.gte(0)
  }).timeout(10000)

  it('Should generate valid (simple) proofs', async () => {
    const targetBlock = await provider.getBlockNumber()

    for (let holderAddress of TOKEN_HOLDERS) {
      const tokenInstance = new Contract(TOKEN_ADDRESS, MINIME_ABI, provider)
      const targetBalance = await tokenInstance.balanceOf(holderAddress) as BigNumber
      const proof = await MiniMeProof.get(TOKEN_ADDRESS, holderAddress, MAP_INDEX_SLOT, provider, targetBlock)

      expect(proof).to.be.ok
      expect(Array.isArray(proof.accountProof)).to.eq(true)
      expect(proof.balance).to.match(/^0x[0-9a-fA-F]+$/)
      expect(proof.codeHash).to.match(/^0x[0-9a-fA-F]+$/)
      expect(proof.nonce).to.match(/^0x[0-9a-fA-F]+$/)
      expect(proof.storageHash).to.match(/^0x[0-9a-fA-F]+$/)
      expect(Array.isArray(proof.storageProof)).to.eq(true)
      expect(proof.storageProof.length).to.eq(2)
      proof.storageProof.forEach(item => {
        item.proof.forEach(proof => {
          expect(proof).to.match(/^0x[0-9a-fA-F]+$/)
        })
        expect(item.key).to.match(/^0x[0-9a-fA-F]+$/)
        expect(item.value).to.match(/^0x[0-9a-fA-F]+$/)
      })

      // verify
      await MiniMeProof.verify(holderAddress, proof.storageHash, proof.storageProof, MAP_INDEX_SLOT, targetBalance, targetBlock)
    }
  }).timeout(10000)

  it('Should generate valid (full) proofs', async () => {
    const targetBlock = await provider.getBlockNumber()

    for (let holderAddress of TOKEN_HOLDERS) {
      const tokenInstance = new Contract(TOKEN_ADDRESS, MINIME_ABI, provider)
      const targetBalance = await tokenInstance.balanceOf(holderAddress) as BigNumber
      const result = await MiniMeProof.getFull(TOKEN_ADDRESS, holderAddress, MAP_INDEX_SLOT, provider, targetBlock)

      expect(result.proof).to.be.ok
      expect(Array.isArray(result.proof.accountProof)).to.eq(true)
      expect(result.proof.balance).to.match(/^0x[0-9a-fA-F]+$/)
      expect(result.proof.codeHash).to.match(/^0x[0-9a-fA-F]+$/)
      expect(result.proof.nonce).to.match(/^0x[0-9a-fA-F]+$/)
      expect(result.proof.storageHash).to.match(/^0x[0-9a-fA-F]+$/)
      expect(typeof result.proof.storageProof).to.eq("object")
      expect(result.blockHeaderRLP).to.match(/^0x[0-9a-fA-F]+$/)
      expect(result.accountProofRLP).to.match(/^0x[0-9a-fA-F]+$/)
      result.storageProofsRLP.forEach(proof => {
        expect(proof).to.match(/^0x[0-9a-fA-F]+$/)
      })

      // verify
      await MiniMeProof.verify(holderAddress, result.proof.storageHash, result.proof.storageProof, MAP_INDEX_SLOT, targetBalance, targetBlock)
    }
  }).timeout(10000)

  it('Should validate a proof', async () => {
    const proofs = [proof1, proof2]

    for (let proof of proofs) {
      // Should not throw any error
      const goodBalance = BigNumber.from(proof.balance)
      await MiniMeProof.verify(proof.address, proof.root, proof.storageProof,
        proof.slot, goodBalance, proof.block)

      // Should throw
      const badBalance = BigNumber.from(proof.balance).sub(1000000)
      await MiniMeProof.verify(proof.address, proof.root, proof.storageProof,
        proof.slot, badBalance, proof.block)
        .then(() => expect.fail("The call should have thrown an error but didn't"))
        .catch(() => { }) // ok
    }
  }).timeout(10000)

  it('Should fail the verification if some value has been tampered', async () => {
    const proofs = [proof1, proof2]

    for (let proof of proofs) {
      // Should throw
      const badRoot = "0x" + proof.root.substr(2).split("").reverse().join("")
      await MiniMeProof.verify(proof.address, badRoot, proof.storageProof,
        proof.slot, BigNumber.from(proof.balance), proof.block)
        .then(() => expect.fail("The call should have thrown an error but didn't"))
        .catch(() => { }) // ok

      // Should throw
      const badStorageProof: StorageProof = JSON.parse(JSON.stringify(proof.storageProof))
      badStorageProof[0].proof[0] = "0x" + badStorageProof[0].proof[0].substr(2).split("").reverse().join("")
      await MiniMeProof.verify(proof.address, proof.root, badStorageProof,
        proof.slot, BigNumber.from(proof.balance), proof.block)
        .then(() => expect.fail("The call should have thrown an error but didn't"))
        .catch(() => { }) // ok
    }
  }).timeout(10000)

  it("Should get the size of the checkpoints array", async () => {
    for (let i = 0; i < TOKEN_HOLDERS.length; i++) {
      const size = await getArraySize(TOKEN_ADDRESS, TOKEN_HOLDERS[i], MAP_INDEX_SLOT, provider)
      expect(size).to.be.gt(0)
    }
  })

  it("Should parse the checkpoint", () => {
    const items = [
      { value: "0x00000000000293fb5ca8d27b5662e57700000000000000000000000000c304f2", balance: "3116676321791472042173815", block: "12780786" },
      { value: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", balance: "340282366920938463463374607431768211455", block: "340282366920938463463374607431768211455" }
    ]

    for (let item of items) {
      const { balance, block } = parseCheckPointValue(item.value)
      expect(balance.toString()).to.eq(item.balance)
      expect(block.toString()).to.eq(item.block)
    }

    // More

    const { balance: balance1 } = parseCheckPointValue(proof1.storageProof[0].value)
    expect(balance1.toString()).to.eq(BigNumber.from(proof1.balance).toString())

    const { balance: balance2 } = parseCheckPointValue(proof2.storageProof[0].value)
    expect(balance2.toString()).to.eq(BigNumber.from(proof2.balance).toString())
  })

  it("Should check that two proof keys are valid", () => {
    const proofs = [proof1, proof2]
    for (let proof of proofs) {
      checkMiniMeKeys(proof.storageProof[0].key, proof.storageProof[1].key, proof.address, MAP_INDEX_SLOT)
    }
  })
})

// HELPERS

const proof1 = {
  "address": "0x75ebce762600f8d2171c42e1f1af07c1fbf39832",
  "root": "0x9e38fc8a3d67075aed963f0be7fea6d0a145eacefe9c1e4deccfd927e3ea5c36",
  "balance": "0x46dcfc710c599000",
  "block": 9000000,
  "slot": 8,
  "storageProof": [
    {
      "key": "0x330ab7905c8fb5542e92680b2b2b8c88a6e77d413a85eb0890d3a41300d2c6c4",
      "value": "0x46dcfc710c5990000000000000000000000000000041ff25",
      "proof": [
        "0xf90211a0af3b3ced06aa45be075bff644dee25e6880c9387d6b83378a60ecff951307977a08edcf8eee9011293221a309e8aad24963e7bbdda53698b11369b16705102e190a041feb4172362fe1edf071db805479dc289989300bc80d9b7ca784b6cb2a1bcfda0fdb4830042633f54eda13afcb246310b63a499dcf6ef43f41d4b03476456525ea0c7da42e4276f7816e017793c7f8adf6f85ab6ad15301474266b6f5bf483bd7d7a0d427ed4496be78466d09cd33171b623c884ed8a32eebda93695e5c499ced3a54a00402122112c54359e7c3846ce7fdac6092741fe9f2dd7ca980dd5c1ade3cce95a0fc1ef74cc92efceb5792d4fc08bc7ce49629a3c9c4e73a2a8fcf3eb37850a703a0741fabe73be0df6066450b1c2eb0db6cc91f35b121c623c3b470803fcc9d8df9a0ab31eba2fc1d564f1c3334c1795491bface1322e9e3f847e3db0bfc242333bcaa0ddcdaa7ac12ac1ce8cb95b3d1e8b49639e8ca0fe83ba4b254782201df6fe0caba073d4c19ede045c9aa00561eb0d115ea32cb4ac3aceb3d02329b0506df9c3d050a0693858525c98e6a9f2719f57ebadf61391085d5448a832594aa370fe339d2b53a00269e6b3188a36402b2bcf8f19c5006d93f9a6fb5dc705fde5ce1dff9ce400b9a0a35cb3c41d87fdd2dc9dd78d859261970915e70bedfbb829a7702b4b410d6af5a0f7bf0d93ed337e036582460cd6c8376c7dec977e7ccd861d9f9f3d54c0be36aa80",
        "0xf90211a0620f25db9ffc91ceeec3f9fc0c06a463ae64d1e2c6e683a45d293c29d95d7fffa0f6f4dc6065e0f463969575e02b91f4e16e717eedc127d2ce07755148c76cd8e2a0c26cc10d32c797f6c106e216d9ad755bd08f21ad3e00d38e57e1a6d3b215b6f1a0803e89c7572c9940b0857d6e7d672e97a91be11d8694e50a099bf5c7aff6ae62a0261fabd3cc0beba4306cd2173e131fc63c1aac79895343ced7c0c84f05029f04a03c1a87f4b2292ed2950a6cb393fe18227a5e29fa2af0c88a145db82c8d59d849a0c0e7273c75a97443cb8170965ca7e63a20839521f47d1ffc2419d95ba16fb9d2a0fb48d26592dde7c3e8f45d0e833f35dd9bea336190eff70953c1b9da69275304a0ab3a72f4c2608f4192da1ddc30c2ede227d635687e906fb52fa9f46ead5e1bcba0e26d9172b2b7b421be30db5c0f140604f5d2cf68664d3cfabd99d1e0aad9ec4da0e3a09fd15062539cbde73d81952fb1dfc17f520332902fcf7137a962d94ce3cca05b1d4dff469b5ec380848599415ba8066b9e99b3a0e14cd3c0a0f3ec74701b5aa06b48f495e62a531168cb623ef92867cfa17b49a8ac116df84808f98a386febe7a0d65e980453464d3af1573a18c4d719b7e2746d7e20342560affa5ca1e5a3d2b2a053d03c985f17bc599c41500145c7c1cbbbd955082daceb72341fcad391efbba9a02218f9094aebddb0abfcf5fc26c5d7727187baacc8abcbe166b020cd9f189b3780",
        "0xf90211a08aeb3291a2f0cd48d99324d60ab5bf04e024bcb3f8c19685b4d8d833b38d43cca0cd8fd59c3d86b31ef931ba44968f9fda7a104c13009555646c4367edb121fec0a0e5d56bb667300e8b068182b050219c07830354d9e992927fbff0921cd2f472b9a0ce31011c477a7ba01245e8daef62d671547c1d02c16f4f6e1c368e23239d106ba048192867c492aa4eb2b12a4a683b71fb8f2298fcf3de35f934ef1c3baaf9b9c1a0151f15b9d2d977a5c7192181d80f08523359c127d7325a40be9b7fbc7335ff42a08837fb52895fb13d37b1d70cc53d68703e09029b86f530bd09c1704d6cd9303fa04be11fe0ec7cc93e1d64368fa40ce4b54f18992744bab80c753b34d463692ef7a02ac08e69d06b4dc3a3d71a5b2600dab56dd32384824fd000f12d923544d8a3f5a091251aa9a0f8e34c89023ed2c1d4521b09a5ee62307138f1fc8f54098e861c44a00e7e69aa7717437e61b9e23317dc5c51cbe3e566aeeb646fda1ede942448516ea0916aab503ca07b486288cfa0542345dfe1addf99749f14e7ee1f74c66b0151eea06bf260767a03484947bd20d29ec6d694cd7e6a2df0a19b2a1b7db3c67c5bf91da0790a92e75504d280ea5462a52cc057b078cc7f0a03d1bd4a8ff32d77374932b0a0bf0d9401e5c50bcf0f310e972bcbd934ccddef5807e2665df5d8e129544df207a08b0c5bd61cce1f895bce8b2f4382dd9365082f504c374e394c210256e672913780",
        "0xf90211a0b8b3a53d3fc840488142ab03081f6979f30b76674e6a9a4ba27c168a8d5a600da0aa6a534b4554bfbf0dbedb079e2e53a94c14e43869426155ec193f42222cbc13a099f5d19c4850914ed46f20db91945560d0cde27fb54db180d7d4a9971738ab09a02cc613dcb1237eb0b23b9ac9da1e76b4f555c9b1017624cbb43d5f4a133ce8eea06617ccfd863a0e763750fd8646dce6c630cfafecaa4c7d9a6e76522de06f4a27a0d42b818e6873db62c5f3c22324bf7eba1d813b4da520fc1ec26f7b24d042cd1ea039493bf0e26ed725f3cd04eeb75d1ec6203ffc512005a03e2f75ce18d1458747a0ab49ff7c830b7a24cc55a421397cbde7ee615e8680feac7f0a883d466a635823a0b897cf67499926875a69333cbfb814511e5f3190cf5b935e8fd9e46389f80a26a066eaa22b8897fd2fa13e84914c2cbd80faedb42eb4e4598558813af85ab4fb8ea0835868728b6215b2b684b1e584901361bee25bd38c2eeb64836448178cdc885ca0a3178c9acae82857143c0536fb1fb84c7dcca413ba5cd6c5c4bee3ec65873057a0b19c476ce183402a2d81c5013fd7175424c102f958a37a8ecacfa0ac08a311e1a050219355dfed0efb66390b8a5be8f0a82dcae63f2aa0c22755244b8457ec9579a01caff6b4f10db9b6d1a527163be9af83b481422eaac5196fe68f57d34714f05fa05957a5a072b2879a58c497c8e901146cad3b908fa378ef5f050c948fe00e05e680",
        "0xf87180808080808080a0e7b9f235af8b4bc66d7758d0e50a03a7a4782c109264c46cb67a346822910441a01c45844bf7acd1469b24b1a81276176bb4e33c148cd9bc01e694b3093f33b63180a09b9052eda712319cd45d7783727b1105449133c2f5b358b3feb6332bbe6607c0808080808080",
        "0xf8399e3beafb9b4ac9a6439a0c86f56d8c1e2fda2eb0476c1ae1ed4decf88d0a6d999846dcfc710c5990000000000000000000000000000041ff25"
      ]
    },
    {
      "key": "0x330ab7905c8fb5542e92680b2b2b8c88a6e77d413a85eb0890d3a41300d2c6c5",
      "value": "0x0",
      "proof": [
        "0xf90211a0af3b3ced06aa45be075bff644dee25e6880c9387d6b83378a60ecff951307977a08edcf8eee9011293221a309e8aad24963e7bbdda53698b11369b16705102e190a041feb4172362fe1edf071db805479dc289989300bc80d9b7ca784b6cb2a1bcfda0fdb4830042633f54eda13afcb246310b63a499dcf6ef43f41d4b03476456525ea0c7da42e4276f7816e017793c7f8adf6f85ab6ad15301474266b6f5bf483bd7d7a0d427ed4496be78466d09cd33171b623c884ed8a32eebda93695e5c499ced3a54a00402122112c54359e7c3846ce7fdac6092741fe9f2dd7ca980dd5c1ade3cce95a0fc1ef74cc92efceb5792d4fc08bc7ce49629a3c9c4e73a2a8fcf3eb37850a703a0741fabe73be0df6066450b1c2eb0db6cc91f35b121c623c3b470803fcc9d8df9a0ab31eba2fc1d564f1c3334c1795491bface1322e9e3f847e3db0bfc242333bcaa0ddcdaa7ac12ac1ce8cb95b3d1e8b49639e8ca0fe83ba4b254782201df6fe0caba073d4c19ede045c9aa00561eb0d115ea32cb4ac3aceb3d02329b0506df9c3d050a0693858525c98e6a9f2719f57ebadf61391085d5448a832594aa370fe339d2b53a00269e6b3188a36402b2bcf8f19c5006d93f9a6fb5dc705fde5ce1dff9ce400b9a0a35cb3c41d87fdd2dc9dd78d859261970915e70bedfbb829a7702b4b410d6af5a0f7bf0d93ed337e036582460cd6c8376c7dec977e7ccd861d9f9f3d54c0be36aa80",
        "0xf90211a04e3413e97982db0004265a75adccd547f2107960ec484b4fa666a748b29354e7a0e9fe169cdea371454681dbacc903b2a35ce2d935a1e284d9754441d090471023a01bce3df004bc24efcce7b6ad9bd29543c6bdb423e548ac0c8f4e105a9e0aa550a036762cf6b643769b393dee510a4a704373fe6a77eb6a3b1fce8c7a3d21a28240a0a8344a38205f2ebaa2f0c088ba3e503e292df2a6b832aa484223f3498a16a078a057ed25aea471058586848d32e7a1710cafad80f4794b756620abf922a27c5678a091c22476b5466c1c6f48b42b0f1e44af4b5709398472cb0df9e7a89db06dac29a021d68f60ac7aef36ba833370785867ba73064affecaef192b53c8d0b79556599a0d1c5e047c56283ac59aa6422763f6bf6e354c58480f4257aa5d5d1d339cb6121a061df7ce115952854be83c9caa92dca9e3d8caed0ae4b39852acf8ef2ed264a57a0849d78566a4eb840933f5a85fdfc01121c7ce6e55713ca478e589c01f7dcf3eca0b5577304f85c558c41e7e2e9457d1f7a50eafecd9d31a621aac17d7a7ba9f5f9a071467d35cf4abba5d101f8d5acd5416b5426126884ec4b61bb49144be9e5ebbaa081492892493a3e5a449118284a791d35a2d043ac009c2eed875664eda2a58491a0899c0b0ae10a8caea6b304172c3479f5c504db12e38945db8ee6804fd77b88c0a045e5e864a849b620c640a6fb1b2ec555b98eef0e989ba27332d32edd76da9be280",
        "0xf90211a0a40d6fb8b2296b2115db599a04edf6df31125c8db397c57296a6aa4a1087cdf8a0a32625cd3d26691afea2d4a7e035070dcb587c31550e3e50b2bda1e5550e9c4aa0bf0f4c8443f4b99f9e234ff25ed577499038a0d1b5eb4d5b534fc117c2a97ae8a09fa39c79980dbe0620cd5d4f6b1d3e23a8a14cd4163117dc26629d7f3bb5b7d5a07f7817fc81b775de604e0ee9a8e8c06c7b04edee62a1d3fb9bd862cbad285442a0be9b17d73b5a899c69a7a391d1467bf9420e37ea307b37175303bf8b7623ea66a0d64eecf23857a74c29f57528da885158ea8acf49b6a5c1b5261f5625f1c98138a0ef441ba72b462c14f898dc6db92e373a3f41cdc417abd879de6037b596b728e6a0327ee2b281416624143690a987fbc98bd2729e2565538a5e86af0b8a2924c99fa0cc88d918e319ccefaf78be74516c1c0f962187860b9a3365921aa26dc4a229bca0e9d5abb630d083ecd9cbcfe4595c129db075b3998daecd2035e13b139b005c35a0b1e937c0d5e48cbad6db412d952a249a0bf0ed180619c6678ca53be55d75757da0727c797f66063f28296c3a0858a49991e0dc0482f42d85c9013293caf267fc65a074ee04f4ee6ce11f2e6f10f7f6d0b310f97829e850505f8f5d9dd290b4e1000aa08136a6ba4a85c55cb83829b8f11e5e5895df1105c346778106416deaa2f11b3ba0d9bf9732f7f31c6f4e393de38f61b35bf46e54b904c9c1e4283bd662199e06e580",
        "0xf90211a08628c2fd1dfe51f3d2834fc02a708dac6e938327314dde4c14aaba40bfef5df8a01ce8e71dfb04156a15d026df346a4369a7776c77631ae2ba56cb82118543c0bca046be89a8eb587f2d800a92374493c30d3faf85837be4506edd4d9ab908443706a0c9762b1c8a594791da399d98ce53c57cf344e4d90da811efbc514c341a2c2a92a0352f84be4bf7beaa02c1f07e08da72828885e920a81d3bbaf7acde4873e633dda00f0a49b5d21a14fa233c96c9428c271951d849b02f323b8b1ac04cf2a5903907a0d90c0c6efabbcb2bbb083822ba6d25b3d1a1f805556599254cdd273184c8fb1ba0462540fc4e54b6e1c24f5be7a351a400d02654f8fc91ef0256d7f6d2f3da148ca030d18eafe4cd720d9ad99bf0c3bac7fd17065497c78b0242dbfbd93872a5f4b0a04bf97dc63199f8991a752d9e4ed0887d835990c7d3a3db0bd3f158a3d7b87a4da0c429a6e35235a7f0f155b848e9f8fbe5a60e8bca4712170785fca889a61d0aaca0d44e3f039757418db7af393ef0567bf7867138039daaccd2eb1c3063aa08ba38a064f018e18f53cfb972c1a9fab2ff3769776a99f237f2b2d0c7e764e382f0dcd1a0c243ee4fc54d88fa98fdf8387e67deecde6d574b8785fc6b03e8cb6ee51a7944a039437c5056c2ab8a778028442bac0e3a7d1528f46c2885ef440ff6a139ec86e2a00411278ab8299244021d3ecb3972a6809d1e0902f490ed44c567da575f152bc380",
        "0xf8918080a0260cedc91668c7d503298bba51add18576e4303a946bc6831c08b7b3ed7d75db808080a0545c2934b45d18f034c70e61339b111de538a25a1296a86ffe5813c92fc51ed8a0c1cf823e96f4b5cca6d7569a2a36600af6451f22443706a6e762a1c3615422ef808080a0db9254341f867a9b3fb77034c7d743fcf0bf3eb8f593eabe4238de1f725c1e1e8080808080",
        "0xf8718080808080a060db0d07a52788ecbf20c4c0e0f55303e8a03d4e506c9c1344a3ec9f00581f3f80808080a0351c4e169c7725d6b8d35bf3c560c18bdc8cb71b4a551b019ac71df8a15e0d9da0b2cd42b4e08f02e11e7a783aaec6c457c5f4a38a768e56ce6010a03cff416bde8080808080"
      ]
    }
  ]
}

const proof2 = {
  "address": "0xbd9c69654b8f3e5978dfd138b00cb0be29f28ccf",
  "root": "0x1778ec12b19b5c6036edbe69e9a54dddc397813f292ce276aabb3fc4184abe4c",
  "balance": "0x0293ca8fbc70ffaffde577",
  "block": 12743076,
  "slot": 8,
  "storageProof": [
    {
      "key": "0x25a7599f71cc507621bc7f672ca927b1800f73b2a3e7c8d22648bda4ccb055b4",
      "value": "0x293ca8fbc70ffaffde57700000000000000000000000000c271a4",
      "proof": [
        "0xf90211a0dcc1e39d0a69b99e6ec5ec20c140cfe39a966d665c5eab729af9e5fa4c3778bca01f7cae4fc1aa99cffb937740ef11923d6f95b87cf301cb42319c4a1228749beca04d98e6c67d3433166968fcab2e2f84f3b9351b7b20da66b70dd91c9c9e5fabe4a013bf27946d1ef2834ec0945d4e70cbfee01256edae6eea3000d8c42a687e21a5a05c7f43c9d05000b48f4ab201483a1c70d5733db6dc63af5345df69b4693c754ea0ec098bcc6e1a1e291e510db5c2f0df76e18e5a8e03cf476dfe251bda5605e810a0cf001bccd72bd4d9d439e981fcd3107a58a6c2df5ee37c2dc32acdd09b317ba8a03700357d763fd3935dd7c585d621da5b4a82e7d237169acf9d18618ca3aee2f6a02435caf55e43ddb879b3962e833ae560c906bf978ad6a0efd50adcf97f2e7111a092895b092500fa7f2068a04cda020cdd3e2d5e4793035ce5bca7e7c25fd1c067a061d2c277a1d8e38370a25e4e7fb83439779e70287cbece7a49f09c6aed698973a048fd7e33254210b956d9ed2786b6ac201d6275bedf7399ff1cc574f5898b95dea0cfc0c1f4eb33b6961503319ef97bc3117bc4cb96ca21c892e460b1e9e1851e1aa0ceec3805ca5f8b52e4fda470bd998b63dc48f3a9dc3b51e63345e34e53f17253a034b477ac9d0bbf851ba81f931021097f4e6a796609ed141fd1339dc9667e9ed4a09b9e28a91bf0929f2bfc25ef5a59183d01f7122947c044a4fcd636427853fc0980",
        "0xf90211a0aee4bf111c4871d2b7a36be8c32b3f1ddf316a8fbbd555c78574d2a7fe557986a06693c6bc2eeedbf0ba3e36706b238b4078c313950db195dfdef2f85128a43f5ba0bb8fa22ef4155d2deccb89c4a392edbebbf2278e100369debaa4d9108c5c7574a0455e0d4d186fdb55cf30cdaf83e045b518263314e242897907c0c14bbbba6376a0ccf3c57fa3f2725310242c669d81d77b2ee4fb155f868cfd9c441cc31c2c0660a00ebb9463488f9be97fe692d54c27e1be551c79e4a05c4887e9d37ef44a6a1d29a0ef8f96693db94f38dec6c2b5b08b541fbbcc958202ec6b0dee0dcd7a863f8793a05e7407a9440242315e2a63e6cac70eee95de6d869042f8547ca08382863c61f7a0f7511d5375bfcaf199910c866fc8129efa7cb5a35980122f2302f826d9e90e0aa0460d9dc2ef1f169d82f331b45fcefd22bb4a53346873dce07d3eb07201fe728fa02e7d453b1a2b45b18536544ae0a2c5b56bb6d9e197f502c65f7bfe6c13b81266a08f0bd9a3e1affcd42b59eee5b8011c1761480ee80d149d81fe239ce86c838d25a0833149bc28c07a89a2d067a389b2551852c9c78024b8d2a94537eb55dcd10fe9a045ce24ddee9479e9c1bc1e06bfe4f69539263ea735d073ed609b86a6d42a7ca0a0391c2dff00f58c78b09d3dfde61f16b562b7892f37f1ce24422c18c90405269fa08415dc6e93bbd49eea848823ab94329cd544a957f3138a3901270d61f8f1a54a80",
        "0xf90211a0a3091c0d6b4dfaaf39a017e4b13d2e76a8040d6e8e53519da4cd87780b8759ffa0b798dd470cf43be73b8d6a88c6b29782450d6e56be4ee7a8006fcf60885fcee7a0c76d8dee631dadcb62b8f9902cbd1bf540b66de5e0d40d1c7d1a41dcbde16927a015e1c7f71bb994109077df8b62c57b58549678be0d9f816470ab19140195187ea09792f8ca1432037bd23f6ed79abc36cc2c775be6671db5de2ccd6ab4b8507816a051d69f8c21de407ffcba7fb9809d40c11cee7eb741a878981ceb2fece8b86ed2a02a61fa4278fcbf5c3f1394d8eeab6f1eb5c1bf1632b553113bd1747b39b325f1a01379892c60fca87636a392edc70747387df0df7f9bbf9d1dd7fbe40a7e44df6ca03fb5d4e1f1c87a5d56c83a561d1d7289cada93fb05ba143d8c4ff28428e19e9da013bf4e2428996f788a8e446b4120d9efed60f1354e93f1abcde4bc7b0e27a897a0eac99d7126e8b7e882f11602fa7401dfb0a469f274ee77da9203104f397b2f96a01373d9d5886980a42d25e2ffcea86f01716bbc149783b8bbcbd2584616284a83a0793ae24b00fd059ee434af515bafd9f5cc611722e74728b4bca04ef49b6e64fda03d3265f1a116b1057f99d0ccde25c6ca78d9a38c4202d1575745212f6efb85daa034c2d0c4abe064161f75b09bfe5faa17a286a77a423404fb061f29fd593b1be2a0144a9bb413370b1b7ca0b92c87f4dd516f07214fbc1a95038aead60f28aa54a580",
        "0xf90211a046812886c78889ac2411ffa3c0340fb3c4012a34f67722a82ef2d1a02a3598d9a04b083dac965279e8df39417077032290a1a372f28a65d33bcbe645258339abaaa08e0e9a0b88160921ec8bce5cb0b8e329aa168d6bd441b1841557c6beb2a0b2cda0e143d7287edba24c35d389f91b9af4ac65669dd7caca60d80d7ad958c73010dda0a38495fd674c25b6662080a2de6e88946e9b71cab9a1c0f67d487e3cbeb362efa0826a86b90e0a2627cb9d84ed8f2fab35d1e1e69d6bffb07d1ac4d11eabdad77fa092209392b4ec2d240f0441cc7bf7208d96831c10014a7b6d9323b5c7c8b13d2ca054417e60e4f23e4505e72149a345582cedd6232cfae7b511a4f7eec35e618977a0c6c9ca7495bc7865544cc59803f2ed76f1f2773f7adf73c1a65cd229eb3f9993a01a168b0bc63db793a642ebf6c3f9735f80e8a6e6af45f670dded4ab175f855cfa0df81b925dd54518b429dc8abc9590d1715c9416b6ca4102e373200478b89c1ffa0381f7aca36fb9dfc9a61cb8c31ded0390365454ee3c46c0c0d9577ddfdebeaf9a04954268e0eff1576c0e1cf57ae1d83d1400d2db88de469a946e8724c207b304aa04564d4b67f2524f3a88717ef6b7744941cce4fecf5024eeed1ab285ad2861163a057aba255bccc5dccdd35820e8ee46a01e54670216033e55191c5c1b5a69c53f7a00386a82e565793b4c33d891ee773d9997ee483e1a737413b58cc031f4f09ce1a80",
        "0xf9015180a028ff14f99486c64e5058a52c3ddbe28ea993444c8951d680205fad8e7d258e7d8080a0c5d226fa14b93579cee1e2f9a948942a3b8791d02227f05bbf279962ab184d36a0dd33b896cee078ebe12bf13b5cf8081e654fb5ad1d224cf41e31d1dee126e45980a03bca3277acd9ff0ca4bddbaefd97d4f6542080bbfdd4e0bb89e29b41bb46c2d7a06d42315137945df0c89a2d7026a5509db2ca975906aba00585f88220926ad942a024fc37a191afe39350cdd23ecc1b056f17cd36fb9ca27aa47f4491a5626f5e22a0e546a8c933c97089b95c18001ea1bae7a51b5a010fcffb0a13ffab48253feb40a0561f4993170634430a7ebbd9a83c6c34027d35b15d4b125f6cd8ff6b03a9736e80a0bc9f19d8c808f3590a355b1ddff52902b21d6e3643bfa9827c939582d9c8c36180a096c1ebb9c159f6cb1e5c7f8fa1bc7d31fe00534a094889aa8a84054b1979239e80",
        "0xf83c9e3f86db895877250a8d2aae88ff23684e09dd9c6e482a85e58094695e2f199c9b0293ca8fbc70ffaffde57700000000000000000000000000c271a4"
      ]
    },
    {
      "key": "0x25a7599f71cc507621bc7f672ca927b1800f73b2a3e7c8d22648bda4ccb055b5",
      "value": "0x0",
      "proof": [
        "0xf90211a0dcc1e39d0a69b99e6ec5ec20c140cfe39a966d665c5eab729af9e5fa4c3778bca01f7cae4fc1aa99cffb937740ef11923d6f95b87cf301cb42319c4a1228749beca04d98e6c67d3433166968fcab2e2f84f3b9351b7b20da66b70dd91c9c9e5fabe4a013bf27946d1ef2834ec0945d4e70cbfee01256edae6eea3000d8c42a687e21a5a05c7f43c9d05000b48f4ab201483a1c70d5733db6dc63af5345df69b4693c754ea0ec098bcc6e1a1e291e510db5c2f0df76e18e5a8e03cf476dfe251bda5605e810a0cf001bccd72bd4d9d439e981fcd3107a58a6c2df5ee37c2dc32acdd09b317ba8a03700357d763fd3935dd7c585d621da5b4a82e7d237169acf9d18618ca3aee2f6a02435caf55e43ddb879b3962e833ae560c906bf978ad6a0efd50adcf97f2e7111a092895b092500fa7f2068a04cda020cdd3e2d5e4793035ce5bca7e7c25fd1c067a061d2c277a1d8e38370a25e4e7fb83439779e70287cbece7a49f09c6aed698973a048fd7e33254210b956d9ed2786b6ac201d6275bedf7399ff1cc574f5898b95dea0cfc0c1f4eb33b6961503319ef97bc3117bc4cb96ca21c892e460b1e9e1851e1aa0ceec3805ca5f8b52e4fda470bd998b63dc48f3a9dc3b51e63345e34e53f17253a034b477ac9d0bbf851ba81f931021097f4e6a796609ed141fd1339dc9667e9ed4a09b9e28a91bf0929f2bfc25ef5a59183d01f7122947c044a4fcd636427853fc0980",
        "0xf90211a09b71ba939391f11873619f1485b28ccff4f82c307ada11ebc55c89c399cb03ada08707d4ee35e0cddf0b1c5e0e741b9e5a06a845492e69335015d3e15ac071e93fa02b259d0a74389c95163ac48b7d7cc21fa6c4b88fd0e1a7cc11ec2705f298f143a0a8e47fb85490b054a6e5a41c3b6c4223c48f96b6e9a65a35c42d1f1c642af57aa0645263a870e97dba3f34f172b3fefbfc62be4172721043e4a3f1c7da7681edaba0442736a22acdabc8a748d4f9509ee60c31380a557b1b379f8bf218d34fc35c50a025dbee8981097d50c7d9b63bd517687c1437d87b9412afb1622b1f2ec2567b81a00b5890040ce417e090b1f4db3bf5b821a64b00fe5030076ba0057cb984656bc6a040a7e77ad8bfffc07e4316065fdb4eb12068905552b9736b1c4883064e148bf7a0033cfe45191e18d6c24754d719acc27004be45e7c00d77d453cf0300f622ec86a03febfa8e3a9af3ad3ed4b1bbcc000e8f375c198955347960a060c4df7e8d6262a01314a87f953887b83e268a036fea7a21cb23b6e9bc5a5a1342b638b359b93f34a060422f3c85e7493f3413afc6e73ef447372fcc22271e0f9fd25c742da26aa217a042f0be13d42d5001c8674b6df4ff5fda166b55276051ce00339d289c551f754aa00b1d9f4dd46cc489627374138ec313d38aeeb50baa7f6556f4bca64661ea80c8a039451466ed1b5d02a52cb962de7c52933cd4eb4f08f2ddd0ceff96c512f853d880",
        "0xf90211a01f4e7d1627bc65a09d8aac9b777bb62ad92a7d742ce00b8e39ca03a6f1bdd4bfa0aeaaa067fa3ad8b8c1352a2eb086a7d80b619a9e954898302bb54aac2a580888a0bd13681290fb0cb03848e2c2ae4fc48267ed708d0ea453d47310e7b8c676850ca03be0d8737a368f1f2cbf4a5665e28e7965a493e7d521022ab8ecfb5a42759e60a0fecd6db0a06292d872d96521404dba9d176823450066f641230b124e303b79f6a01ebcd9035bac2bb87c96c389b9f6b7307ef0db10ecf5ecc1abddac5d91506cb2a0256e31d30797fbe76fc194a219a2784f72c0b2850010fcd13d9ab8bd781ecb68a0ca5f9467b58bcf543f1d9f796b93b03622a54317408dcfe500ea9ce7de54220ea03d887644ef21ae2046f1e9035d3aeed524cd2ca3e0c2dcdae2642ca6796d7ebba084d4225ea797f5ca498adf6b30a83b4cad1853210025880eba9f0f2f6f2e8be5a02aa767777d307e000e5901422272b37c4134a24f154b59ca85790e857727a247a0fff31eb7ae28c63dabb8eecf64724e066e203c96dd65b3c8164974730819aa9ba07ff418c514cd85966992f998280cb90a92d7d063cb0d41c904361ff4494db0c6a01dee75007d41fb92e6c6e1c49ac45c241de4699134398643e598132a9d3224ada0e3b6eaee5e3a720e8cdac26a2d0dd056e17d7d9cd268778c5fcc73834ad015f4a05b2be630ed55951a54fe0c59ab12c22f4bd0b947186366235c096ecbb53b3eec80",
        "0xf90211a0703dc4b34f82f8da0d88be3466b492030943390743eec24dd212f70461114470a0376156a921eff3646f8fde5dcd09a43142bbe17206bb704eeaf0ebe86532e109a0482f8dedfcf8594a6176a6037b9af61f2296699224636f5874346c029194711aa0cea35f64980e677c64513a6dc4ac3dc7aa0b3f790e0c2005142fdfa5d49269e0a04b36d236a15144a1538c6219d4860857fb2a61d606ad79a3c579317ec8c43734a0db9d56dbc845090b95c5902c5a937860074d005276e91ce75b18be3bf5d6a651a01e9931923eb1b292a59c5af11259b39b202bf6a5eaf267e91da711447f609dc8a0debb8201ffc93286825511aa312a2ce6ea49ce9cc70bc912500d241d0e77eff1a0aaa743a24960ae73c4e2094cf2fa9fbeaa659f12fe402728a0b045ccad360138a0bfc485bacc720267fa859d1b6ce2b94a994b697a94cca5928b9af5f9bec62688a061d253de7f94a85004211f61806d1ed29ca818ed31e56d3dec6cb49d86c515f1a07e32f826a6b32892e8da6b4a858ee28914d441b5537817f492b74a01711f625ba0f6872ce36ec20967e568dceb585d6c6e3030d37c11dd671aee5a8144c4a8ee0aa04fd974620101b1584bba4229dd838a0bd2fce2748b582cd5c560618aa2603856a07352742e4e2d84d18d940882876b0a8191250a788b5d175e712adc146d72293ca0c20e98c5f04597d5ca6fba997fd2b0b68514784b858137c54f00f29f036e656780",
        "0xf90111a0847bd2a11386429655fa8266b712dea9ee60a5dd8fb75fce65202ba74a5ca425a0c987c7ec554bbf5ac2a6ffe662d5c658fbd4342e16d44be8f1edf3ae64e2a57780a0b629780837003133b72c5bb467312b6d3617ced2d1280c67618a4bd12a9e5e30808080a02718d4d156cba73b5932a1e22e23520f27341302c469b6132d1f9620b3e914a8808080a0d10d29a425662283af124c81993e9e762eaa149aff509de93122779599d0367b80a02a87ed02511246766fa338bfc23eb3e95889c24f7f1da6209d07cee592f7fd91a06dd16aa376623c26d051009a280c8c813ec1b65566f1c973d4dbae2917c71771a0ec98a9f0ba352b90ccf878598aa6eff5c50acf9729e44e0c5e8ae7cd0cd29c5680",
        "0xf83b9e3851d07ebfaa493ffd621e38211c521bf71ea7542c0d6b9e47fea3e337dc9b9a01382dab7bc7c1fb568c00000000000000000000000000bf24db"
      ]
    }
  ]
}