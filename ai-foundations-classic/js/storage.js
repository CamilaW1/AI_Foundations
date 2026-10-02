let legacy=JSON.parse(localStorage.getItem('aif-state')||'null');let state=JSON.parse(localStorage.getItem('aif-state-v3')||'null')||Object.assign({done:[],mistakes:[],correct:0,attempts:0,positions:{},theoryPos:{},settings:{autoListen:false,speed:1,readAnswers:true}},legacy||{});
state.positions=state.positions||{};state.theoryPos=state.theoryPos||{};state.settings=Object.assign({autoListen:false,speed:1,readAnswers:true},state.settings||{});

function save(){ localStorage.setItem('aif-state-v3', JSON.stringify(state)); }
