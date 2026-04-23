// PlayPal — Game Data & Constants (v2 — expanded course database)

const FORMATS = { WOLF:'wolf', NASSAU:'nassau', STABLEFORD:'stableford', PASS_MONEY:'passmoney', SKINS:'skins' };

const FORMAT_INFO = {
  wolf:      { label:'Wolf',           icon:'🐺', desc:'Rotating wolf picks a partner or goes lone wolf each hole' },
  nassau:    { label:'Nassau',         icon:'💰', desc:'Three bets: Front 9, Back 9, and Full 18 (with presses)' },
  stableford:{ label:'Stableford',     icon:'⭐', desc:'Points-based: Eagle=5, Birdie=3, Par=2, Bogey=1' },
  passmoney: { label:'Pass the Money', icon:'💸', desc:'Worst net score passes a chip to best net score per hole' },
  skins:     { label:'Skins',          icon:'🎴', desc:'Win a hole outright to claim the skin — ties carry over' },
};

const COURSES = [
  {
    id:'pebble', name:'Pebble Beach Golf Links', location:'Pebble Beach, CA', rating:75.5, slope:145,
    holes:[
      {num:1,par:4,yds:381,hdcp:11},{num:2,par:5,yds:502,hdcp:7},{num:3,par:4,yds:388,hdcp:13},
      {num:4,par:4,yds:331,hdcp:17},{num:5,par:3,yds:188,hdcp:9},{num:6,par:5,yds:513,hdcp:3},
      {num:7,par:3,yds:106,hdcp:15},{num:8,par:4,yds:418,hdcp:1},{num:9,par:4,yds:464,hdcp:5},
      {num:10,par:4,yds:446,hdcp:2},{num:11,par:4,yds:380,hdcp:10},{num:12,par:3,yds:202,hdcp:12},
      {num:13,par:4,yds:399,hdcp:8},{num:14,par:5,yds:573,hdcp:4},{num:15,par:4,yds:397,hdcp:14},
      {num:16,par:4,yds:402,hdcp:16},{num:17,par:3,yds:208,hdcp:6},{num:18,par:5,yds:543,hdcp:18}
    ]
  },
  {
    id:'torrey', name:'Torrey Pines South', location:'La Jolla, CA', rating:75.9, slope:144,
    holes:[
      {num:1,par:4,yds:447,hdcp:9},{num:2,par:4,yds:389,hdcp:15},{num:3,par:3,yds:199,hdcp:13},
      {num:4,par:4,yds:453,hdcp:1},{num:5,par:4,yds:384,hdcp:7},{num:6,par:5,yds:538,hdcp:5},
      {num:7,par:4,yds:452,hdcp:3},{num:8,par:3,yds:171,hdcp:17},{num:9,par:5,yds:570,hdcp:11},
      {num:10,par:4,yds:408,hdcp:6},{num:11,par:4,yds:224,hdcp:18},{num:12,par:5,yds:504,hdcp:4},
      {num:13,par:3,yds:218,hdcp:10},{num:14,par:4,yds:444,hdcp:2},{num:15,par:4,yds:478,hdcp:8},
      {num:16,par:4,yds:404,hdcp:14},{num:17,par:3,yds:232,hdcp:16},{num:18,par:5,yds:570,hdcp:12}
    ]
  },
  {
    id:'bethpage', name:'Bethpage Black', location:'Farmingdale, NY', rating:76.6, slope:155,
    holes:[
      {num:1,par:4,yds:430,hdcp:7},{num:2,par:4,yds:389,hdcp:17},{num:3,par:3,yds:230,hdcp:11},
      {num:4,par:5,yds:517,hdcp:5},{num:5,par:4,yds:451,hdcp:1},{num:6,par:4,yds:408,hdcp:9},
      {num:7,par:5,yds:492,hdcp:15},{num:8,par:3,yds:207,hdcp:13},{num:9,par:4,yds:414,hdcp:3},
      {num:10,par:4,yds:492,hdcp:2},{num:11,par:4,yds:435,hdcp:8},{num:12,par:4,yds:499,hdcp:4},
      {num:13,par:5,yds:584,hdcp:16},{num:14,par:3,yds:161,hdcp:18},{num:15,par:4,yds:459,hdcp:6},
      {num:16,par:4,yds:478,hdcp:10},{num:17,par:3,yds:207,hdcp:12},{num:18,par:4,yds:411,hdcp:14}
    ]
  },
  {
    id:'augusta', name:'Augusta National Golf Club', location:'Augusta, GA', rating:76.2, slope:148,
    holes:[
      {num:1,par:4,yds:445,hdcp:9},{num:2,par:5,yds:575,hdcp:5},{num:3,par:4,yds:350,hdcp:17},
      {num:4,par:3,yds:240,hdcp:3},{num:5,par:4,yds:495,hdcp:1},{num:6,par:3,yds:180,hdcp:15},
      {num:7,par:4,yds:450,hdcp:7},{num:8,par:5,yds:570,hdcp:11},{num:9,par:4,yds:460,hdcp:13},
      {num:10,par:4,yds:495,hdcp:2},{num:11,par:4,yds:520,hdcp:6},{num:12,par:3,yds:155,hdcp:18},
      {num:13,par:5,yds:510,hdcp:8},{num:14,par:4,yds:440,hdcp:12},{num:15,par:5,yds:550,hdcp:4},
      {num:16,par:3,yds:170,hdcp:16},{num:17,par:4,yds:440,hdcp:10},{num:18,par:4,yds:465,hdcp:14}
    ]
  },
  {
    id:'oakmont', name:'Oakmont Country Club', location:'Oakmont, PA', rating:78.8, slope:155,
    holes:[
      {num:1,par:4,yds:482,hdcp:5},{num:2,par:4,yds:341,hdcp:17},{num:3,par:4,yds:428,hdcp:9},
      {num:4,par:5,yds:609,hdcp:1},{num:5,par:4,yds:379,hdcp:15},{num:6,par:3,yds:194,hdcp:11},
      {num:7,par:4,yds:479,hdcp:3},{num:8,par:3,yds:253,hdcp:13},{num:9,par:5,yds:477,hdcp:7},
      {num:10,par:4,yds:462,hdcp:2},{num:11,par:4,yds:379,hdcp:14},{num:12,par:5,yds:667,hdcp:4},
      {num:13,par:3,yds:183,hdcp:18},{num:14,par:4,yds:358,hdcp:16},{num:15,par:4,yds:500,hdcp:6},
      {num:16,par:3,yds:230,hdcp:12},{num:17,par:4,yds:313,hdcp:10},{num:18,par:4,yds:484,hdcp:8}
    ]
  },
  {
    id:'shinnecock', name:'Shinnecock Hills Golf Club', location:'Southampton, NY', rating:77.0, slope:147,
    holes:[
      {num:1,par:3,yds:239,hdcp:15},{num:2,par:5,yds:226,hdcp:1},{num:3,par:4,yds:478,hdcp:7},
      {num:4,par:4,yds:438,hdcp:9},{num:5,par:4,yds:537,hdcp:3},{num:6,par:4,yds:474,hdcp:5},
      {num:7,par:4,yds:189,hdcp:17},{num:8,par:4,yds:374,hdcp:13},{num:9,par:4,yds:442,hdcp:11},
      {num:10,par:4,yds:412,hdcp:4},{num:11,par:4,yds:158,hdcp:18},{num:12,par:4,yds:469,hdcp:2},
      {num:13,par:4,yds:370,hdcp:14},{num:14,par:3,yds:447,hdcp:6},{num:15,par:5,yds:141,hdcp:16},
      {num:16,par:3,yds:542,hdcp:8},{num:17,par:4,yds:179,hdcp:12},{num:18,par:4,yds:450,hdcp:10}
    ]
  },
  {
    id:'winged', name:'Winged Foot Golf Club (West)', location:'Mamaroneck, NY', rating:76.8, slope:144,
    holes:[
      {num:1,par:4,yds:446,hdcp:11},{num:2,par:4,yds:453,hdcp:5},{num:3,par:3,yds:216,hdcp:15},
      {num:4,par:5,yds:525,hdcp:1},{num:5,par:4,yds:431,hdcp:9},{num:6,par:3,yds:194,hdcp:17},
      {num:7,par:4,yds:166,hdcp:3},{num:8,par:4,yds:442,hdcp:7},{num:9,par:5,yds:471,hdcp:13},
      {num:10,par:4,yds:190,hdcp:16},{num:11,par:4,yds:386,hdcp:8},{num:12,par:3,yds:535,hdcp:4},
      {num:13,par:5,yds:212,hdcp:14},{num:14,par:4,yds:458,hdcp:2},{num:15,par:4,yds:417,hdcp:10},
      {num:16,par:4,yds:457,hdcp:6},{num:17,par:3,yds:209,hdcp:18},{num:18,par:4,yds:448,hdcp:12}
    ]
  },
  {
    id:'riviera', name:'Riviera Country Club', location:'Pacific Palisades, CA', rating:75.9, slope:140,
    holes:[
      {num:1,par:5,yds:501,hdcp:9},{num:2,par:4,yds:463,hdcp:3},{num:3,par:4,yds:434,hdcp:13},
      {num:4,par:4,yds:236,hdcp:17},{num:5,par:3,yds:433,hdcp:5},{num:6,par:4,yds:176,hdcp:15},
      {num:7,par:4,yds:403,hdcp:11},{num:8,par:4,yds:466,hdcp:1},{num:9,par:4,yds:490,hdcp:7},
      {num:10,par:4,yds:315,hdcp:12},{num:11,par:4,yds:564,hdcp:4},{num:12,par:4,yds:476,hdcp:2},
      {num:13,par:4,yds:170,hdcp:18},{num:14,par:4,yds:178,hdcp:16},{num:15,par:5,yds:502,hdcp:8},
      {num:16,par:4,yds:166,hdcp:14},{num:17,par:4,yds:590,hdcp:6},{num:18,par:4,yds:475,hdcp:10}
    ]
  },
  {
    id:'merion', name:'Merion Golf Club (East)', location:'Ardmore, PA', rating:75.7, slope:144,
    holes:[
      {num:1,par:4,yds:355,hdcp:13},{num:2,par:4,yds:535,hdcp:1},{num:3,par:3,yds:183,hdcp:17},
      {num:4,par:4,yds:600,hdcp:3},{num:5,par:4,yds:426,hdcp:9},{num:6,par:4,yds:420,hdcp:7},
      {num:7,par:4,yds:350,hdcp:15},{num:8,par:4,yds:360,hdcp:11},{num:9,par:4,yds:195,hdcp:5},
      {num:10,par:4,yds:312,hdcp:14},{num:11,par:4,yds:369,hdcp:8},{num:12,par:4,yds:397,hdcp:4},
      {num:13,par:3,yds:129,hdcp:18},{num:14,par:5,yds:414,hdcp:10},{num:15,par:4,yds:411,hdcp:6},
      {num:16,par:4,yds:430,hdcp:2},{num:17,par:3,yds:224,hdcp:16},{num:18,par:4,yds:521,hdcp:12}
    ]
  },
  // ── NEW JERSEY ──────────────────────────────────────────────────────────────
  {
    id:'baltusrol', name:'Baltusrol Golf Club (Lower)', location:'Springfield, NJ', rating:75.1, slope:138,
    holes:[
      {num:1,par:4,yds:478,hdcp:7},{num:2,par:4,yds:382,hdcp:15},{num:3,par:3,yds:193,hdcp:17},
      {num:4,par:5,yds:511,hdcp:5},{num:5,par:4,yds:395,hdcp:9},{num:6,par:3,yds:194,hdcp:11},
      {num:7,par:4,yds:467,hdcp:1},{num:8,par:4,yds:365,hdcp:13},{num:9,par:5,yds:565,hdcp:3},
      {num:10,par:4,yds:454,hdcp:4},{num:11,par:4,yds:417,hdcp:10},{num:12,par:5,yds:570,hdcp:2},
      {num:13,par:3,yds:192,hdcp:16},{num:14,par:4,yds:419,hdcp:8},{num:15,par:4,yds:397,hdcp:14},
      {num:16,par:5,yds:536,hdcp:6},{num:17,par:3,yds:213,hdcp:18},{num:18,par:4,yds:542,hdcp:12}
    ]
  },
  {
    id:'plainfield', name:'Plainfield Country Club', location:'Plainfield, NJ', rating:74.8, slope:137,
    holes:[
      {num:1,par:4,yds:420,hdcp:9},{num:2,par:4,yds:380,hdcp:13},{num:3,par:5,yds:520,hdcp:3},
      {num:4,par:3,yds:185,hdcp:17},{num:5,par:4,yds:435,hdcp:5},{num:6,par:4,yds:365,hdcp:11},
      {num:7,par:4,yds:450,hdcp:1},{num:8,par:3,yds:175,hdcp:15},{num:9,par:5,yds:540,hdcp:7},
      {num:10,par:4,yds:410,hdcp:8},{num:11,par:3,yds:205,hdcp:14},{num:12,par:4,yds:445,hdcp:2},
      {num:13,par:5,yds:515,hdcp:4},{num:14,par:4,yds:390,hdcp:12},{num:15,par:4,yds:375,hdcp:16},
      {num:16,par:3,yds:195,hdcp:18},{num:17,par:4,yds:460,hdcp:6},{num:18,par:5,yds:555,hdcp:10}
    ]
  },
  {
    id:'navesink', name:'Navesink Country Club', location:'Red Bank, NJ', rating:73.5, slope:134,
    holes:[
      {num:1,par:4,yds:395,hdcp:7},{num:2,par:5,yds:510,hdcp:11},{num:3,par:3,yds:175,hdcp:17},
      {num:4,par:4,yds:420,hdcp:3},{num:5,par:4,yds:360,hdcp:13},{num:6,par:4,yds:405,hdcp:5},
      {num:7,par:3,yds:165,hdcp:15},{num:8,par:5,yds:490,hdcp:9},{num:9,par:4,yds:430,hdcp:1},
      {num:10,par:4,yds:385,hdcp:6},{num:11,par:4,yds:415,hdcp:2},{num:12,par:3,yds:185,hdcp:16},
      {num:13,par:5,yds:525,hdcp:10},{num:14,par:4,yds:400,hdcp:8},{num:15,par:4,yds:370,hdcp:14},
      {num:16,par:3,yds:200,hdcp:18},{num:17,par:4,yds:440,hdcp:4},{num:18,par:5,yds:545,hdcp:12}
    ]
  },
  {
    id:'deal', name:'Deal Golf & Country Club', location:'Deal, NJ', rating:72.8, slope:129,
    holes:[
      {num:1,par:4,yds:375,hdcp:9},{num:2,par:3,yds:170,hdcp:17},{num:3,par:5,yds:490,hdcp:5},
      {num:4,par:4,yds:400,hdcp:3},{num:5,par:4,yds:345,hdcp:15},{num:6,par:4,yds:415,hdcp:1},
      {num:7,par:3,yds:160,hdcp:13},{num:8,par:5,yds:495,hdcp:11},{num:9,par:4,yds:390,hdcp:7},
      {num:10,par:4,yds:380,hdcp:8},{num:11,par:3,yds:180,hdcp:16},{num:12,par:5,yds:500,hdcp:4},
      {num:13,par:4,yds:395,hdcp:2},{num:14,par:4,yds:355,hdcp:14},{num:15,par:4,yds:430,hdcp:6},
      {num:16,par:3,yds:175,hdcp:18},{num:17,par:5,yds:510,hdcp:12},{num:18,par:4,yds:420,hdcp:10}
    ]
  },
  {
    id:'metedeconk', name:'Metedeconk National Golf Club', location:'Howell, NJ', rating:75.4, slope:141,
    holes:[
      {num:1,par:4,yds:445,hdcp:5},{num:2,par:5,yds:525,hdcp:9},{num:3,par:3,yds:195,hdcp:15},
      {num:4,par:4,yds:425,hdcp:3},{num:5,par:4,yds:385,hdcp:13},{num:6,par:4,yds:455,hdcp:1},
      {num:7,par:3,yds:185,hdcp:11},{num:8,par:5,yds:545,hdcp:7},{num:9,par:4,yds:415,hdcp:17},
      {num:10,par:4,yds:430,hdcp:2},{num:11,par:3,yds:200,hdcp:14},{num:12,par:5,yds:550,hdcp:4},
      {num:13,par:4,yds:405,hdcp:10},{num:14,par:4,yds:375,hdcp:16},{num:15,par:4,yds:460,hdcp:6},
      {num:16,par:3,yds:190,hdcp:18},{num:17,par:5,yds:535,hdcp:8},{num:18,par:4,yds:450,hdcp:12}
    ]
  },
  {
    id:'springlake', name:'Spring Lake Golf Club', location:'Spring Lake, NJ', rating:72.2, slope:126,
    holes:[
      {num:1,par:4,yds:365,hdcp:7},{num:2,par:4,yds:380,hdcp:5},{num:3,par:3,yds:155,hdcp:17},
      {num:4,par:5,yds:475,hdcp:11},{num:5,par:4,yds:340,hdcp:13},{num:6,par:4,yds:390,hdcp:3},
      {num:7,par:3,yds:150,hdcp:15},{num:8,par:5,yds:480,hdcp:9},{num:9,par:4,yds:400,hdcp:1},
      {num:10,par:4,yds:355,hdcp:6},{num:11,par:3,yds:165,hdcp:18},{num:12,par:5,yds:465,hdcp:4},
      {num:13,par:4,yds:370,hdcp:10},{num:14,par:4,yds:345,hdcp:16},{num:15,par:4,yds:410,hdcp:2},
      {num:16,par:3,yds:160,hdcp:14},{num:17,par:5,yds:490,hdcp:8},{num:18,par:4,yds:395,hdcp:12}
    ]
  },
  {
    id:'canoebrook', name:'Canoe Brook Country Club (North)', location:'Summit, NJ', rating:73.9, slope:133,
    holes:[
      {num:1,par:4,yds:410,hdcp:7},{num:2,par:5,yds:505,hdcp:11},{num:3,par:3,yds:185,hdcp:15},
      {num:4,par:4,yds:430,hdcp:3},{num:5,par:4,yds:375,hdcp:13},{num:6,par:4,yds:415,hdcp:5},
      {num:7,par:3,yds:175,hdcp:17},{num:8,par:5,yds:520,hdcp:9},{num:9,par:4,yds:400,hdcp:1},
      {num:10,par:4,yds:395,hdcp:8},{num:11,par:3,yds:195,hdcp:14},{num:12,par:5,yds:510,hdcp:4},
      {num:13,par:4,yds:405,hdcp:10},{num:14,par:4,yds:365,hdcp:16},{num:15,par:4,yds:440,hdcp:2},
      {num:16,par:3,yds:180,hdcp:18},{num:17,par:5,yds:525,hdcp:6},{num:18,par:4,yds:425,hdcp:12}
    ]
  },
  {
    id:'roycebrook', name:'Royce Brook Golf Club (East)', location:'Hillsborough, NJ', rating:73.2, slope:130,
    holes:[
      {num:1,par:4,yds:400,hdcp:9},{num:2,par:5,yds:495,hdcp:13},{num:3,par:3,yds:170,hdcp:17},
      {num:4,par:4,yds:415,hdcp:5},{num:5,par:4,yds:360,hdcp:11},{num:6,par:4,yds:405,hdcp:3},
      {num:7,par:3,yds:165,hdcp:15},{num:8,par:5,yds:505,hdcp:7},{num:9,par:4,yds:390,hdcp:1},
      {num:10,par:4,yds:380,hdcp:8},{num:11,par:3,yds:185,hdcp:16},{num:12,par:5,yds:495,hdcp:4},
      {num:13,par:4,yds:395,hdcp:10},{num:14,par:4,yds:355,hdcp:14},{num:15,par:4,yds:425,hdcp:2},
      {num:16,par:3,yds:175,hdcp:18},{num:17,par:5,yds:510,hdcp:6},{num:18,par:4,yds:410,hdcp:12}
    ]
  },
  {
    id:'twistedune', name:'Twisted Dune Golf Club', location:'Egg Harbor Twp, NJ', rating:74.5, slope:138,
    holes:[
      {num:1,par:4,yds:430,hdcp:5},{num:2,par:5,yds:530,hdcp:9},{num:3,par:3,yds:190,hdcp:13},
      {num:4,par:4,yds:420,hdcp:3},{num:5,par:4,yds:390,hdcp:11},{num:6,par:4,yds:445,hdcp:1},
      {num:7,par:3,yds:180,hdcp:15},{num:8,par:5,yds:540,hdcp:7},{num:9,par:4,yds:405,hdcp:17},
      {num:10,par:4,yds:415,hdcp:4},{num:11,par:3,yds:200,hdcp:14},{num:12,par:5,yds:545,hdcp:2},
      {num:13,par:4,yds:400,hdcp:10},{num:14,par:4,yds:370,hdcp:16},{num:15,par:4,yds:450,hdcp:6},
      {num:16,par:3,yds:185,hdcp:18},{num:17,par:5,yds:530,hdcp:8},{num:18,par:4,yds:440,hdcp:12}
    ]
  },
  {
    id:'architects', name:"Architects Golf Club", location:'Lopatcong, NJ', rating:73.0, slope:131,
    holes:[
      {num:1,par:4,yds:395,hdcp:7},{num:2,par:3,yds:175,hdcp:15},{num:3,par:5,yds:500,hdcp:5},
      {num:4,par:4,yds:410,hdcp:3},{num:5,par:4,yds:365,hdcp:13},{num:6,par:4,yds:420,hdcp:1},
      {num:7,par:3,yds:170,hdcp:17},{num:8,par:5,yds:510,hdcp:9},{num:9,par:4,yds:385,hdcp:11},
      {num:10,par:4,yds:375,hdcp:8},{num:11,par:3,yds:180,hdcp:16},{num:12,par:5,yds:505,hdcp:4},
      {num:13,par:4,yds:390,hdcp:10},{num:14,par:4,yds:360,hdcp:14},{num:15,par:4,yds:430,hdcp:2},
      {num:16,par:3,yds:175,hdcp:18},{num:17,par:5,yds:515,hdcp:6},{num:18,par:4,yds:420,hdcp:12}
    ]
  },
  {
    id:'mountainridge', name:'Mountain Ridge Country Club', location:'West Caldwell, NJ', rating:74.2, slope:136,
    holes:[
      {num:1,par:4,yds:405,hdcp:9},{num:2,par:4,yds:375,hdcp:15},{num:3,par:5,yds:510,hdcp:7},
      {num:4,par:3,yds:180,hdcp:17},{num:5,par:4,yds:420,hdcp:3},{num:6,par:4,yds:360,hdcp:13},
      {num:7,par:4,yds:440,hdcp:1},{num:8,par:3,yds:170,hdcp:11},{num:9,par:5,yds:525,hdcp:5},
      {num:10,par:4,yds:395,hdcp:6},{num:11,par:3,yds:195,hdcp:14},{num:12,par:4,yds:435,hdcp:2},
      {num:13,par:5,yds:515,hdcp:4},{num:14,par:4,yds:385,hdcp:12},{num:15,par:4,yds:370,hdcp:16},
      {num:16,par:3,yds:190,hdcp:18},{num:17,par:4,yds:450,hdcp:8},{num:18,par:5,yds:540,hdcp:10}
    ]
  },
  // ── NEW JERSEY (additional public courses) ──────────────────────────────────
  {
    id:'blueheronpines', name:'Blue Heron Pines Golf Club (West)', location:'Cologne, NJ', rating:73.8, slope:136,
    holes:[
      {num:1,par:4,yds:418,hdcp:7},{num:2,par:5,yds:530,hdcp:13},{num:3,par:3,yds:188,hdcp:15},
      {num:4,par:4,yds:410,hdcp:3},{num:5,par:4,yds:375,hdcp:11},{num:6,par:4,yds:440,hdcp:1},
      {num:7,par:3,yds:178,hdcp:17},{num:8,par:5,yds:528,hdcp:9},{num:9,par:4,yds:398,hdcp:5},
      {num:10,par:4,yds:405,hdcp:4},{num:11,par:3,yds:192,hdcp:16},{num:12,par:5,yds:542,hdcp:2},
      {num:13,par:4,yds:388,hdcp:12},{num:14,par:4,yds:362,hdcp:18},{num:15,par:4,yds:448,hdcp:6},
      {num:16,par:3,yds:182,hdcp:14},{num:17,par:5,yds:518,hdcp:8},{num:18,par:4,yds:432,hdcp:10}
    ]
  },
  {
    id:'harborpines', name:'Harbor Pines Golf Club', location:'Egg Harbor Twp, NJ', rating:72.9, slope:132,
    holes:[
      {num:1,par:4,yds:388,hdcp:9},{num:2,par:5,yds:508,hdcp:11},{num:3,par:3,yds:172,hdcp:17},
      {num:4,par:4,yds:398,hdcp:5},{num:5,par:4,yds:358,hdcp:13},{num:6,par:4,yds:422,hdcp:1},
      {num:7,par:3,yds:163,hdcp:15},{num:8,par:5,yds:512,hdcp:7},{num:9,par:4,yds:388,hdcp:3},
      {num:10,par:4,yds:378,hdcp:6},{num:11,par:3,yds:178,hdcp:18},{num:12,par:5,yds:498,hdcp:4},
      {num:13,par:4,yds:382,hdcp:10},{num:14,par:4,yds:348,hdcp:16},{num:15,par:4,yds:418,hdcp:2},
      {num:16,par:3,yds:168,hdcp:14},{num:17,par:5,yds:502,hdcp:8},{num:18,par:4,yds:408,hdcp:12}
    ]
  },
  {
    id:'sandbarrens', name:'Sand Barrens Golf Club', location:'Swainton, NJ', rating:74.1, slope:137,
    holes:[
      {num:1,par:4,yds:412,hdcp:7},{num:2,par:5,yds:518,hdcp:9},{num:3,par:3,yds:185,hdcp:15},
      {num:4,par:4,yds:425,hdcp:3},{num:5,par:4,yds:378,hdcp:13},{num:6,par:4,yds:445,hdcp:1},
      {num:7,par:3,yds:175,hdcp:17},{num:8,par:5,yds:535,hdcp:7},{num:9,par:4,yds:402,hdcp:5},
      {num:10,par:4,yds:398,hdcp:4},{num:11,par:3,yds:195,hdcp:16},{num:12,par:5,yds:528,hdcp:2},
      {num:13,par:4,yds:392,hdcp:10},{num:14,par:4,yds:365,hdcp:18},{num:15,par:4,yds:438,hdcp:6},
      {num:16,par:3,yds:180,hdcp:12},{num:17,par:5,yds:522,hdcp:8},{num:18,par:4,yds:425,hdcp:14}
    ]
  },
  {
    id:'pinebarrens', name:'Pine Barrens Golf Club', location:'Jackson, NJ', rating:74.6, slope:139,
    holes:[
      {num:1,par:4,yds:428,hdcp:5},{num:2,par:5,yds:540,hdcp:11},{num:3,par:3,yds:192,hdcp:13},
      {num:4,par:4,yds:418,hdcp:3},{num:5,par:4,yds:382,hdcp:15},{num:6,par:4,yds:452,hdcp:1},
      {num:7,par:3,yds:182,hdcp:17},{num:8,par:5,yds:548,hdcp:7},{num:9,par:4,yds:408,hdcp:9},
      {num:10,par:4,yds:422,hdcp:2},{num:11,par:3,yds:202,hdcp:16},{num:12,par:5,yds:555,hdcp:4},
      {num:13,par:4,yds:398,hdcp:8},{num:14,par:4,yds:372,hdcp:14},{num:15,par:4,yds:448,hdcp:6},
      {num:16,par:3,yds:188,hdcp:18},{num:17,par:5,yds:538,hdcp:10},{num:18,par:4,yds:435,hdcp:12}
    ]
  },
  {
    id:'preaknesshills', name:'Preakness Hills Country Club', location:'Wayne, NJ', rating:72.5, slope:128,
    holes:[
      {num:1,par:4,yds:382,hdcp:9},{num:2,par:4,yds:358,hdcp:15},{num:3,par:5,yds:495,hdcp:7},
      {num:4,par:3,yds:172,hdcp:17},{num:5,par:4,yds:408,hdcp:3},{num:6,par:4,yds:348,hdcp:13},
      {num:7,par:4,yds:425,hdcp:1},{num:8,par:3,yds:162,hdcp:11},{num:9,par:5,yds:508,hdcp:5},
      {num:10,par:4,yds:378,hdcp:6},{num:11,par:3,yds:185,hdcp:16},{num:12,par:4,yds:418,hdcp:2},
      {num:13,par:5,yds:498,hdcp:4},{num:14,par:4,yds:368,hdcp:12},{num:15,par:4,yds:355,hdcp:18},
      {num:16,par:3,yds:178,hdcp:14},{num:17,par:4,yds:432,hdcp:8},{num:18,par:5,yds:518,hdcp:10}
    ]
  },
  {
    id:'creamridge', name:'Cream Ridge Golf Course', location:'Cream Ridge, NJ', rating:71.8, slope:124,
    holes:[
      {num:1,par:4,yds:368,hdcp:9},{num:2,par:4,yds:352,hdcp:13},{num:3,par:5,yds:478,hdcp:5},
      {num:4,par:3,yds:162,hdcp:17},{num:5,par:4,yds:395,hdcp:3},{num:6,par:4,yds:338,hdcp:15},
      {num:7,par:4,yds:412,hdcp:1},{num:8,par:3,yds:155,hdcp:11},{num:9,par:5,yds:492,hdcp:7},
      {num:10,par:4,yds:362,hdcp:8},{num:11,par:3,yds:172,hdcp:16},{num:12,par:4,yds:405,hdcp:2},
      {num:13,par:5,yds:482,hdcp:4},{num:14,par:4,yds:355,hdcp:14},{num:15,par:4,yds:342,hdcp:18},
      {num:16,par:3,yds:165,hdcp:12},{num:17,par:4,yds:418,hdcp:6},{num:18,par:5,yds:505,hdcp:10}
    ]
  },
  {
    id:'seaoaks', name:'Sea Oaks Golf Club', location:'Little Egg Harbor, NJ', rating:73.2, slope:133,
    holes:[
      {num:1,par:4,yds:398,hdcp:7},{num:2,par:5,yds:512,hdcp:11},{num:3,par:3,yds:178,hdcp:15},
      {num:4,par:4,yds:408,hdcp:3},{num:5,par:4,yds:368,hdcp:13},{num:6,par:4,yds:432,hdcp:1},
      {num:7,par:3,yds:168,hdcp:17},{num:8,par:5,yds:518,hdcp:9},{num:9,par:4,yds:392,hdcp:5},
      {num:10,par:4,yds:385,hdcp:6},{num:11,par:3,yds:182,hdcp:18},{num:12,par:5,yds:505,hdcp:4},
      {num:13,par:4,yds:378,hdcp:10},{num:14,par:4,yds:352,hdcp:16},{num:15,par:4,yds:425,hdcp:2},
      {num:16,par:3,yds:172,hdcp:14},{num:17,par:5,yds:508,hdcp:8},{num:18,par:4,yds:412,hdcp:12}
    ]
  },
  {
    id:'hopedale', name:'Hopedale Golf Club at High Bridge Hills', location:'High Bridge, NJ', rating:72.6, slope:129,
    holes:[
      {num:1,par:4,yds:375,hdcp:9},{num:2,par:4,yds:360,hdcp:15},{num:3,par:5,yds:488,hdcp:7},
      {num:4,par:3,yds:168,hdcp:17},{num:5,par:4,yds:398,hdcp:3},{num:6,par:4,yds:345,hdcp:13},
      {num:7,par:4,yds:418,hdcp:1},{num:8,par:3,yds:158,hdcp:11},{num:9,par:5,yds:502,hdcp:5},
      {num:10,par:4,yds:368,hdcp:8},{num:11,par:3,yds:175,hdcp:16},{num:12,par:4,yds:408,hdcp:2},
      {num:13,par:5,yds:492,hdcp:4},{num:14,par:4,yds:358,hdcp:14},{num:15,par:4,yds:345,hdcp:18},
      {num:16,par:3,yds:162,hdcp:12},{num:17,par:4,yds:422,hdcp:6},{num:18,par:5,yds:512,hdcp:10}
    ]
  },
  // ── NATIONAL ────────────────────────────────────────────────────────────────
  {
    id:'tpc', name:'TPC Sawgrass (Stadium)', location:'Ponte Vedra Beach, FL', rating:76.8, slope:144,
    holes:[
      {num:1,par:4,yds:423,hdcp:9},{num:2,par:5,yds:532,hdcp:11},{num:3,par:3,yds:177,hdcp:17},
      {num:4,par:4,yds:384,hdcp:15},{num:5,par:4,yds:466,hdcp:3},{num:6,par:4,yds:393,hdcp:13},
      {num:7,par:4,yds:442,hdcp:5},{num:8,par:3,yds:237,hdcp:7},{num:9,par:5,yds:583,hdcp:1},
      {num:10,par:4,yds:424,hdcp:10},{num:11,par:5,yds:535,hdcp:12},{num:12,par:4,yds:358,hdcp:18},
      {num:13,par:3,yds:181,hdcp:16},{num:14,par:4,yds:467,hdcp:2},{num:15,par:4,yds:448,hdcp:6},
      {num:16,par:5,yds:523,hdcp:14},{num:17,par:3,yds:137,hdcp:8},{num:18,par:4,yds:462,hdcp:4}
    ]
  },
];

const DEFAULT_PLAYERS = [
  {id:'p1', name:'Thatch Adams', initials:'TA', ghin:'1234567', ghinLogin:'tadams@gmail.com', email:'tadams@gmail.com', venmo:'thatch-adams', handicap:8,  color:'#3DCB6C'},
  {id:'p2', name:'Bird',         initials:'BI', ghin:'7654321', ghinLogin:'bird@gmail.com',   email:'bird@gmail.com',   venmo:'bird-golf',    handicap:14, color:'#E5534B'},
  {id:'p3', name:'Shark',        initials:'SH', ghin:'2345678', ghinLogin:'shark@gmail.com',  email:'shark@gmail.com',  venmo:'shark-golf',   handicap:5,  color:'#C9A84C'},
  {id:'p4', name:'Bulldog',      initials:'BU', ghin:'8765432', ghinLogin:'bulldog@gmail.com',email:'bulldog@gmail.com',venmo:'bulldog-golf', handicap:18, color:'#7B9FE0'},
];

function generateSyncCode() {
  return Math.random().toString(36).substring(2,8).toUpperCase();
}

function getHoleStrokes(handicap, holeHdcp) {
  const base = Math.floor(handicap / 18);
  const rem  = handicap % 18;
  return base + (holeHdcp <= rem ? 1 : 0);
}

// expose data/constants for non-module browser usage (GitHub Pages safe)
if (typeof window !== 'undefined') {
  Object.assign(window, {
    FORMATS,
    FORMAT_INFO,
    COURSES,
    DEFAULT_PLAYERS,
    generateSyncCode,
    getHoleStrokes,
  });
}
