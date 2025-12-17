
const { ethers } = require("ethers");
var web3Utils = require('web3-utils')
const BN = require('bn.js')

const { Transaction } = require('@ethereumjs/tx')
const Common = require('@ethereumjs/common').default

//const Vault = require("./vault");


var tokenContractJSON = require('../contracts/_FuckTrumpIndexCoin.json');


var busySendingSolution = false;
var queuedMiningSolutions = [];


var lastSubmittedMiningSolutionChallengeNumber;

// Track the next nonce to use for transactions
var nextNonce = null;

module.exports =  {


  init(ethers, provider, wallet,  miningLogger, contractAddress, gasPriceGwei, priorityGasFeeGwei)
  {
    

    this.gasPriceGwei=gasPriceGwei;
    this.priorityGasFeeGwei = priorityGasFeeGwei ;
    this.provider = provider; 

    this.wallet = wallet;

    this.tokenContract =  new ethers.Contract(contractAddress, tokenContractJSON.abi, wallet); 

    this.miningLogger = miningLogger;


    busySendingSolution = false;
    nextNonce = null; // Reset nonce tracking on init

    var self= this;

    setInterval(function(){ self.sendMiningSolutions()} , 500)

  },



    async checkMiningSolution(addressFrom,solution_number,challenge_digest,challenge_number,target,callback){

      this.tokenContract.checkMintSolution(solution_number,challenge_digest, challenge_number, target)

    },


  async sendMiningSolutions()
    {

      var self = this;

    //  console.log( 'sendMiningSolutions' )
      if(busySendingSolution == false)
      {
        if(queuedMiningSolutions.length > 0)
        {
          busySendingSolution = true;


          var nextSolution = queuedMiningSolutions.pop();

          this.miningLogger.appendToStandardLog("Popping queued mining solution " + nextSolution.toString())


          if( nextSolution.challenge_number != lastSubmittedMiningSolutionChallengeNumber)
          {
            lastSubmittedMiningSolutionChallengeNumber =  nextSolution.challenge_number;
            //console.log('popping mining solution off stack ')

            try{
            var response = await this.submitMiningSolution(nextSolution.hashingEthAddress,
              nextSolution.solution_number, nextSolution.challenge_digest  );
            }catch(e)
            {
              this.miningLogger.appendToErrorLog(e)
              console.log(e);
            }
          }


          busySendingSolution = false;
        }
      }



    },


    async collectMiningParameters( )
    {

      var miningDifficultyString = await this.tokenContract.getMiningDifficulty()  ;
      var miningDifficulty = parseInt(miningDifficultyString)

      var miningTargetString = await this.tokenContract.getMiningTarget() ;
      // Convert BigInt to string if needed (ethers v6 returns BigInt)
      // Use BN.js directly to avoid web3Utils.toBN() serialization issues with large numbers
      var targetString = typeof miningTargetString === 'bigint' 
        ? miningTargetString.toString() 
        : String(miningTargetString);
      var miningTarget = new BN(targetString, 10)

      var challengeNumber = await this.tokenContract.getChallengeNumber() ;

      console.log("collecting mining parameters..");
      //console.log('Mining difficulty:', miningDifficulty);
      console.log('Challenge number:', challengeNumber)

      return {
        miningDifficulty: miningDifficulty,
        challengeNumber: challengeNumber,
        miningTarget: miningTarget
      };

    },


  queueMiningSolution( solnData )
  {

    //console.log('pushed solution to stack')
    queuedMiningSolutions.push( solnData );

  },




  async submitMiningSolution(addressFrom, solutionNumber, challengeDigest) {
    console.log("\n--- Submitting solution for reward ---");
    console.log("Nonce:", solutionNumber);
    console.log("Challenge Digest:", challengeDigest, "\n");

    try {
      // Get the pending transaction count to include unconfirmed transactions (ethers v6)
      const pendingTxCount = await this.provider.getTransactionCount(this.wallet.address, "pending");
      
      // Initialize or update nextNonce if needed
      if (nextNonce === null || pendingTxCount > nextNonce) {
        nextNonce = pendingTxCount;
      }
      
      // Use the tracked nonce and increment it immediately to prevent race conditions
      const txCount = nextNonce;
      nextNonce = nextNonce + 1;
      
      console.log("Transaction Count (pending):", pendingTxCount);
      console.log("Using Nonce:", txCount);

      

      // Prepare the transaction data
      const txData = await this.tokenContract.populateTransaction.mint(
        solutionNumber,
        challengeDigest
      );

      const gasPrice = ethers.parseUnits(this.gasPriceGwei.toString(), "gwei");
      /*const estimatedGasCost = await this.provider.estimateGas({
        ...txData,
        from: addressFrom
      });*/

     // console.log("Estimated Gas Cost:", estimatedGasCost.toString());
      console.log("Transaction Data:", txData.data);

      // Prepare and send the transaction
     /* const txOptions = {
        ...txData,
        nonce: txCount,
        gasLimit: estimatedGasCost,
        gasPrice: gasPrice
      };*/


      var max_gas_cost = 1704624;


       // Set EIP-1559 fee parameters (ethers v6)
       const maxFeePerGas = ethers.parseUnits(this.gasPriceGwei.toString(), "gwei"); // Example: 50 gwei max fee per gas
       const maxPriorityFeePerGas = ethers.parseUnits(this.priorityGasFeeGwei.toString(), "gwei"); // Example: 2 gwei priority fee

       // Prepare and send the transaction with Type 2 options
       const txOptions = {
           ...txData,
           nonce: txCount,
           gasLimit: max_gas_cost,
           maxFeePerGas: maxFeePerGas,
           maxPriorityFeePerGas: maxPriorityFeePerGas,
           type: 2 // Explicitly set Type 2 transaction
       };


      const transactionResponse = await this.wallet.sendTransaction(txOptions);
      console.log("Transaction Hash:", transactionResponse.hash);

      const receipt = await transactionResponse.wait(); // Wait for transaction confirmation
      console.log("Transaction confirmed in block", receipt.blockNumber);

      return receipt;
    } catch (error) {
      console.error("Transaction failed:", error);
      
      // If transaction failed due to nonce error, reset nonce tracking
      // and let it be re-initialized on next successful call
      if (error.code === 'NONCE_EXPIRED' || error.code === 'SERVER_ERROR') {
        const errorMessage = error.message || error.toString();
        if (errorMessage.includes('nonce') || errorMessage.includes('NONCE')) {
          console.log("Nonce error detected, resetting nonce tracking");
          nextNonce = null;
        }
      }
      
      return error;
    }
  }

  
  /*
  async submitMiningSolution(addressFrom,solution_number,challenge_digest){

    this.miningLogger.appendToStandardLog("Submitting Solution " + challenge_digest)



    console.log( '\n' )
    console.log( '---Submitting solution for reward---')
    console.log( 'nonce ',solution_number )
    console.log( 'challenge_digest ',challenge_digest )
    console.log( '\n' )

   var mintMethod = this.tokenContract.methods.mint(solution_number,challenge_digest);

  try{
    var txCount = await this.web3.eth.getTransactionCount(addressFrom);
    console.log('txCount',txCount)
   } catch(error) {  //here goes if someAsyncPromise() rejected}
    console.log(error);
      this.miningLogger.appendToErrorLog(error)
     return error;    //this will result in a resolved promise.
   }


   var addressTo = this.tokenContract.options.address;



    var txData = this.web3.eth.abi.encodeFunctionCall({
            name: 'mint',
            type: 'function',
            inputs: [{
                type: 'uint256',
                name: 'nonce'
            },{
                type: 'bytes32',
                name: 'challenge_digest'
            }]
        }, [solution_number, challenge_digest]);

    var gweiToWei = 1e9;


    var gas_price_wei = this.gas_price_gwei * gweiToWei;
    var max_gas_cost = 1704624;



    var estimatedGasCost = await mintMethod.estimateGas({gas: max_gas_cost, from:addressFrom, to: addressTo });


    //console.log('estimatedGasCost',estimatedGasCost);
    console.log('txData',txData);

    console.log('addressFrom',addressFrom);
    console.log('addressTo',addressTo);



    //if( estimatedGasCost > max_gas_cost){
    //  console.log("Gas estimate too high!  Something went wrong ")
    //  return;
    //}


    const txOptions = {
      nonce: web3Utils.toHex(txCount),
      gas: web3Utils.toHex(estimatedGasCost), 
      gasPrice: web3Utils.toHex( gas_price_wei ),
      value: 0,
      to: addressTo,
      from: addressFrom,
      data: txData
    }


      var miner_wallet = this.miner_wallet;


  return new Promise(function (result,error) {

       this.sendSignedRawTransaction(this.web3,txOptions,addressFrom, pKey, function(err, res) {
        if (err) error(err)
          result(res)
      })

    }.bind(this));


  },




  async sendSignedRawTransaction(web3,txOptions,addressFrom, pKey ,callback) {


    var fullPrivKey = pKey;

    var privKey = this.truncate0xFromString( fullPrivKey )

    const privateKey = Buffer.from( privKey, 'hex')
    
    // Convert txOptions to format expected by @ethereumjs/tx
    // Determine chain ID - try to get from provider, otherwise default to Polygon (137)
    let chainId = txOptions.chainId;
    if (!chainId && this.provider) {
      try {
        const network = await this.provider.getNetwork();
        chainId = Number(network.chainId);
      } catch (e) {
        // Fallback to Polygon mainnet if can't get chain ID
        chainId = 137;
      }
    } else if (!chainId) {
      chainId = 137; // Default to Polygon mainnet
    }
    const common = Common.custom({ chainId: chainId });
    
    // Convert hex strings to proper format
    const txData = {
      nonce: txOptions.nonce ? (typeof txOptions.nonce === 'string' ? txOptions.nonce : '0x' + txOptions.nonce.toString(16)) : '0x0',
      gasPrice: txOptions.gasPrice ? (typeof txOptions.gasPrice === 'string' ? txOptions.gasPrice : '0x' + txOptions.gasPrice.toString(16)) : undefined,
      gasLimit: txOptions.gas ? (typeof txOptions.gas === 'string' ? txOptions.gas : '0x' + txOptions.gas.toString(16)) : '0x5208',
      to: txOptions.to,
      value: txOptions.value ? (typeof txOptions.value === 'string' ? txOptions.value : '0x' + txOptions.value.toString(16)) : '0x0',
      data: txOptions.data || '0x',
      chainId: chainId
    };
    
    const transaction = Transaction.fromTxData(txData, { common });

    transaction.sign(privateKey)

    const serializedTx = transaction.serialize().toString('hex')

      try
      {
        var result =  web3.eth.sendSignedTransaction('0x' + serializedTx, callback)
      }catch(e)
      {
        console.log(e);
      }
  },


   truncate0xFromString(s)
  {

    if(s.startsWith('0x')){
      return s.substring(2);
    }
    return s;
  }


*/


}
