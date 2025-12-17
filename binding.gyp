{
'conditions': [
    [ 'OS=="win"', {'variables': {'obj': 'obj'}},
    {'variables': {'obj': 'o'}}]],

"targets": [
 

 {
      "target_name": "cpuminer",
      "sources": [
        "miner-engine/cpp/cpuminer/addon.cc",
        "miner-engine/cpp/cpuminer/cpuminer.cpp",
        "miner-engine/cpp/cpuminer/solver.cpp",
        "miner-engine/cpp/cpuminer/sha3.c"
      ],
      'cflags_cc+': [ '-march=native', '-O3', '-std=c++17' ],
      "include_dirs": ["<!(node -e \"require('nan')\")"]
    }

]
}
