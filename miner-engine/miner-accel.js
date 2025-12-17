var web3utils =  require('web3-utils');
var solidityHelper = require('./solidity-helper')
var leftpad =  require('leftpad');

const BN = require('bn.js');

var debugLogger = require('./lib/debug-logger')

var tokenContractJSON = require('./contracts/_FuckTrumpIndexCoin.json');

// Try to load native C++ addon (optional - falls back to JS if not available)
var CPUMiner = null;
var path = require('path');
try {
  // Try root-level build directory (one level up from miner-engine/)
  // From miner-engine/miner-accel.js, ../build/Release/cpuminer resolves correctly
  var addonPath = path.join(__dirname, '../build/Release/cpuminer');
  CPUMiner = require(addonPath);
  console.log('Native C++ CPU miner addon loaded successfully from:', addonPath);
} catch (e) {
  try {
    // Fallback: try with absolute path resolution
    var absPath = path.resolve(__dirname, '../../build/Release/cpuminer');
    CPUMiner = require(absPath);
    console.log('Native C++ CPU miner addon loaded from absolute path');
  } catch (e2) {
    try {
      // Fallback to local build directory
      CPUMiner = require(path.join(__dirname, './build/Release/cpuminer'));
      console.log('Native C++ CPU miner addon loaded from local directory');
    } catch (e3) {
      console.warn('Native C++ CPU miner addon not found. Mining will be slower. Run "npm run build:native" to compile it.');
      // Set a dummy object so code doesn't crash
      CPUMiner = {
        setChallengeNumber: () => {},
        setDifficultyTarget: () => {},
        setMinerAddress: () => {},
        run: (callback) => { callback(new Error('Native addon not available'), null); },
        stop: () => {},
        hashes: () => 0
      };
    }
  }
}


//only load this if selecting 'gpu mine!!!'
var GPUMiner;

var tokenContract;

const PRINT_STATS_TIMEOUT = 5000;
const COLLECT_MINING_PARAMS_TIMEOUT = 4000;

// Track intervals and timeouts for cleanup
var statsInterval = null;
var miningParamsTimeout = null;
var isStopped = false;

module.exports =  {

    async init(contractAddress, ethers, wallet,  miningLogger )
  //  async init(web3, subsystem_command, vault, networkInterface, miningLogger)
    {

      if(this.useCUDA)
      {
        try {
          GPUMiner = require('./build/Release/gpuminer');
        } catch (e) {
          try {
            GPUMiner = require('../../build/Release/gpuminer');
          } catch (e2) {
            console.warn('GPU miner addon not found');
          }
        }
      }

        process.on('exit', () => {
            console.log("Process exiting... stopping miner");
            if (CPUMiner && CPUMiner.stop) {
                CPUMiner.stop();
            }
        });

     //   tokenContract =  new web3.eth.Contract(tokenContractJSON.abi, contractAddress );
        tokenContract = new ethers.Contract(contractAddress, tokenContractJSON.abi, wallet);

        this.miningLogger = miningLogger;



    },



    async mine(miningStyle, wallet, provider, poolURL, gasPriceGwei, priorityGasFeeGwei)
    {
      console.log('init mining'  )


      let minerAccountAddress = wallet.address;


      this.miningStyle = miningStyle;

      //miningParameters


      console.log('Selected mining account:',  '\n',minerAccountAddress  );
      console.log('\n')
      console.log('Selected mining style:',  '\n',miningStyle  );
      console.log('\n')

      if(miningStyle == "solo")
      {

        console.log('Selected mining contract:',  tokenContract.address  );
        console.log('\n')
        console.log("Max Gas price is "+ gasPriceGwei + ' gwei');
        console.log('\n')
        console.log("Priority Gas fee is "+ priorityGasFeeGwei + ' gwei');
        console.log('\n')

      }else if(miningStyle == "pool" )
      {

        console.log('Selected mining pool:',  '\n',poolURL  );
        console.log('\n')


      }else
      {
        console.error('ERROR: no mining style configured. Styles: solo, pool')
        return
      }


        var self = this;



       let miningParameters = {
         challengeNumber: '',
         miningTarget: ''
       };


      

       await self.initMiningProcedure(miningStyle, minerAccountAddress, miningParameters );

      self.miningLogger.appendToStandardLog("Begin mining for " + minerAccountAddress + " with gasprice " +  gasPriceGwei );

      console.log("Mining for  "+ minerAccountAddress);

      // Reset stopped flag when starting
      isStopped = false;

      // Clear any existing intervals
      if (statsInterval) {
        clearInterval(statsInterval);
      }

      statsInterval = setInterval(() => { 
        if (!isStopped) {
          self.printMiningStats();
        }
      }, PRINT_STATS_TIMEOUT);


    },

     mineStuff(miningParameters, minerEthAddress, poolEthAddress, miningStyle) {
        if (!this.mining) {

            this.mineCoins(this.web3, miningParameters,   minerEthAddress, poolEthAddress, miningStyle);
        }
    },



    async initMiningProcedure(miningStyle, minerEthAddress,miningParameters )
    {

  //    console.log('collect parameters.. ')
      var self = this;

    //  var parameters;

      try
      {

          if(miningStyle == "solo")
          {
              miningParameters = await this.networkInterface.collectMiningParameters();
                var hashingEthAddress = minerEthAddress;

            this.miningStyle = 'solo'
          }

          else if(miningStyle == "pool")
          {
            this.miningStyle = 'pool'
            //not working right ?

          //  console.log('collecting mining params from pool ')
              miningParameters = await this.poolInterface.collectMiningParameters(minerEthAddress,miningParameters );
            // console.log('collected mining params from pool ')

              console.log('MINING FOR POOL ', miningParameters)


              //minerEthAddress = miningParameters.poolEthAddress;
              var poolEthAddress = miningParameters.poolEthAddress;
          }
          else {
            console.error(' no mining style !', miningStyle)
          }

          //console.log('collected mining params ', parameters)
          //miningParameters.miningDifficulty = parameters.miningDifficulty;
        //  miningParameters.challengeNumber = parameters.challengeNumber;
      //    miningParameters.miningTarget = parameters.miningTarget;
        //  miningParameters.poolEthAddress = parameters.poolEthAddress;

          //give data to the c++ addon


          //starts mining
          await this.refreshCPUMinerWithParameters(miningStyle , minerEthAddress, poolEthAddress, miningParameters)

    }catch(e)
    {
      console.log(e)
    }

      //keep on looping! (only if not stopped)
      if (!isStopped) {
        // Clear any existing timeout
        if (miningParamsTimeout) {
          clearTimeout(miningParamsTimeout);
        }
        miningParamsTimeout = setTimeout(function(){
          if (!isStopped) {
            self.initMiningProcedure(miningStyle, minerEthAddress, miningParameters);
          }
        }, COLLECT_MINING_PARAMS_TIMEOUT);
      }
    },

    async refreshCPUMinerWithParameters(miningStyle, minerEthAddress, poolEthAddress, miningParameters ){



       let bResume = false;


        if(miningStyle == 'pool' && this.challengeNumber != null)
        {
          //if we are in a pool, keep mining again because our soln probably didnt solve the whole block and we want shares
        //   bResume = true;
          CPUMiner.setChallengeNumber(this.challengeNumber);
          bResume = true;
        }


          // ---- improved auto restart   helpful at low diff ---- 

         /*  if(miningStyle == 'solo') {
              let currentTime = Date.now();

              const delayThreshold = 15 *  1000; // 15 seconds 

       

                // Check if not resuming and not currently mining
                if (!bResume && !this.mining) {
                  // Check if the time since last mined is greater than the threshold
                  if (this.lastMinedAt < currentTime - delayThreshold) {
                    bResume = true;

                    this.lastMinedAt = currentTime;

                    console.log("force mining restart due to delay threshold");
                  }
                }

                // If currently mining, update the last mined time
                if (this.mining || !this.lastMinedAt) {
                  this.lastMinedAt = currentTime;
                }
              }*/
          /// -----  


          if(this.challengeNumber != miningParameters.challengeNumber)
          {
              this.challengeNumber = miningParameters.challengeNumber

              console.log("New challenge number: " + this.challengeNumber);
              CPUMiner.setChallengeNumber(this.challengeNumber);
               bResume = true;
            }


            if(this.miningTarget  == null || !this.miningTarget.eq(miningParameters.miningTarget   ) )
            {
              this.miningTarget = miningParameters.miningTarget

               console.log("New mining target: 0x" + this.miningTarget.toString(16));
               CPUMiner.setDifficultyTarget("0x" + this.miningTarget.toString(16));
             }

             if(this.miningDifficulty != miningParameters.miningDifficulty)
             {

              this.miningDifficulty = miningParameters.miningDifficulty

               console.log("New difficulty: " + this.miningDifficulty);
             }


               if (bResume && !this.mining) {

                   console.log("Restarting mining operations");

                   try
                   {
                     console.log( "started mining with params: ", miningParameters)

                     this.mineStuff(miningParameters, minerEthAddress, poolEthAddress, miningStyle);

                   }catch(e)
                   {
                     console.log(e)
                   }


               }


    },



    async submitNewMinedBlock(blockData)

    //async submitNewMinedBlock(addressFrom, solution_number, digest_bytes, challenge_number)
    {
        this.miningLogger.appendToStandardLog("Giving mined solution to network interface " + blockData.challenge_number);


        if(this.miningStyle == "solo")
        {
          this.networkInterface.queueMiningSolution(blockData)
        }

        if(this.miningStyle == "pool")
        {
          this.poolInterface.queueMiningSolution(blockData);
        }


    },

    // contractData , -> miningParameters
      mineCoins(web3, miningParameters, minerEthAddress, poolEthAddress,  miningStyle)
    {


      var target = miningParameters.miningTarget;
      var difficulty = miningParameters.miningDifficulty;


      var hashingEthAddress;

      if(  miningStyle == "pool" ){
          hashingEthAddress =  poolEthAddress;
      }else{
          hashingEthAddress = minerEthAddress;
      }



        CPUMiner.setMinerAddress(hashingEthAddress);

        var self = this;

        const verifyAndSubmit = (solution_number) => {
            const challenge_number = miningParameters.challengeNumber;
            const digest = web3utils.sha3(challenge_number + hashingEthAddress.substring(2) + solution_number.substring(2));
            const digestBigNumber = web3utils.toBN(digest);
            if (digestBigNumber.lte(miningParameters.miningTarget)) {
                console.log('Submit mined solution for challenge ', challenge_number);
              //  self.submitNewMinedBlock(minerEthAddress, solution_number, digest, challenge_number);

              var blockData = {
                 hashingEthAddress: hashingEthAddress,
                 minerEthAddress: minerEthAddress,
                 poolEthAddress: poolEthAddress,
                 solution_number: solution_number,
                 challenge_digest: digest,
                 challenge_number: challenge_number,
                 target:  target,
                 difficulty:  difficulty
              }
              self.submitNewMinedBlock(blockData)



            } else {
                console.error("Verification failed!\n",
                "challenge: ", challenge_number, "\n",
                "address: ", minerEthAddress, "\n",
                "solution: ", solution_number, "\n",
                "digest: ", digestBigNumber, "\n",
                "target: ", target);
            }
        }

        self.mining = true;

        debugLogger.log('MINING:',self.mining)

       if (CPUMiner && CPUMiner.stop) {
         CPUMiner.stop();
       }
       if (!isStopped && CPUMiner && CPUMiner.run) {
         CPUMiner.run( (err, sol) => {
            if (isStopped) {
              return; // Don't process solutions if stopped
            }
            if (sol) {
                console.log("Solution found!");

                try{
                verifyAndSubmit(sol);
                }catch(e)
                {
                
                  
                  console.log(e)
                }
            }
          //  console.log("Stopping mining operations until the next block...");
          if (!isStopped) {
            self.mining = false;
            debugLogger.log('MINING:',self.mining)
          }

        });
       }
    },


    setNetworkInterface(netInterface)
    {
        this.networkInterface = netInterface;
    },

    setPoolInterface(poolInterface)
    {
        this.poolInterface = poolInterface;
    },


    stop()
    {
      console.log('Stopping mining engine...');
      isStopped = true;

      // Stop the C++ miner
      if (CPUMiner && CPUMiner.stop) {
        CPUMiner.stop();
      }

      // Clear intervals
      if (statsInterval) {
        clearInterval(statsInterval);
        statsInterval = null;
      }

      // Clear timeouts
      if (miningParamsTimeout) {
        clearTimeout(miningParamsTimeout);
        miningParamsTimeout = null;
      }

      // Stop any ongoing mining
      this.mining = false;

      console.log('Mining engine stopped');
    },

    printMiningStats()
    {

      var hashes = CPUMiner.hashes();
      console.log('hashes:', hashes )
        console.log('Hash rate: ' + parseInt( hashes / PRINT_STATS_TIMEOUT) + " kH/s");
    }

}
