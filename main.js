"use strict"

const socket = require('socket.io-client')('https://tehtube.tv:8443');
const readline = require('readline');
const color = require("ansi-color").set;
const ver = '0.1.1';
//process.stdin.setEncoding('utf8');
//process.stdout.setEncoding('utf8');

const logo = ` 
  ______ ______ __  __ ______ __  __ ____   ______
 /_  __// ____// / / //_  __// / / // __ ) / ____/
  / /  / __/  / /_/ /  / /  / / / // __  |/ __/   
 / /  / /___ / __  /  / /  / /_/ // /_/ // /___   
/_/  /_____//_/ /_/  /_/   \\____//_____//_____/   
         __            __ 
  _____ / /_   ____ _ / /_ 
 / ___// __ \\ / __ '// __/
/ /__ / / / // /_/ // /_  
\\___//_/ /_/ \\__,_/ \\__/ 
                              `    
var login = '',
	connected = false,
	userlist = {},
	ucount = 0,
	ranks = {0: 'GST', 1: 'USR', 1.5: 'LDR', 2: 'MOD', 3: 'ADM', 4: 'ADM', 10: 'OWN', 255: 'SA'},
	currentPoll = {poll: {}, closed: false},
	pollHistory = [],
	styles = {highlight: 'black+white_bg', poll: 'bold', err: 'red+bold', pm: 'yellow+bold', ok: 'green+bold'},
	users = [];

function completer(line) {
  let completions = users;
  let hits = completions.filter((c) => c.startsWith(line));
  // show all completions if none found
  return [hits.length ? hits : completions, line];
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "<< ",
    completer: completer
});

function console_out(msg) {
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    console.log(msg);
    rl.prompt(true);
}

console_out(logo);
console_out('--------------------------------------------------------\nType "/help" for list of commands\n--------------------------------------------------------');

function formatMsg(msg) {
	let rep = {"&#39;": "'", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#40;": "(", "&#41;": ")"};
	for (let key in rep) {
		while(msg.indexOf(key) != -1) {
			msg = msg.replace(key, rep[key]);
		}
	};
	while(msg.indexOf('img class="chat-picture"') != -1) {
		let start = msg.indexOf('<img'),
			src = msg.indexOf('src="')+5,
			endsrc = msg.indexOf('"', src),
			end = msg.indexOf('/>')+2;
		msg = msg.slice(0, start) + msg.slice(src, endsrc) + msg.slice(end);

	}
	return msg;
}

function handleMsg(data) {
	let timestamp = new Date(data.time).toTimeString().split(" ")[0];
	let msg = formatMsg(data.msg);
	if (msg.indexOf(login) != -1 && login != '') {msg = color(msg, styles.highlight);}
	console_out(`>> [${timestamp}] ${data.username}: ${msg}`);
}


function getUserIndex(name, list) {
	if (list.length > 0) {
		for (let i = 0; i < list.length; i++) {
			if (list[i] !== undefined && list[i].name == name) return i;
		}
	} 
	return -1;
}

function onAfk(data) {
	let idx = getUserIndex(data.name, userlist);
	if (idx != -1) userlist[idx].meta.afk = data.afk;
}

function printPoll(poll, state) {
	let timestamp = state == 'new' ? new Date(poll.timestamp).toTimeString().split(" ")[0] : new Date().toTimeString().split(" ")[0];
	switch (state) {
		case 'new':
			console_out(color(`>> (${timestamp}) ${poll.initiator} STARTED NEW POLL: ${formatMsg(poll.title)}`, styles.poll));
			break;
		case 'upd':
			console_out(color(`>> [${timestamp}] POLL UPDATE: ${formatMsg(poll.title)}`, styles.poll));
			break;
		case 'close':
			console_out(color(`>> [${timestamp}] [POLL CLOSED]`, styles.poll));
			break;
	}
}

function onPollOpen(data) {
	currentPoll.poll = data;
	currentPoll.closed = false;
	printPoll(currentPoll.poll, 'new');
}

function onPollUpd(data) {
	currentPoll.poll = data;
	printPoll(currentPoll.poll, 'upd');
}

function onPollClose(data) {
	currentPoll.closed = true;
	pollHistory.push(currentPoll)
	currentPoll = {};
	printPoll(pollHistory[pollHistory.length-1].poll, 'close');
}

function onConn() {
	console_out(color("[CONNECTED]", styles.ok));
	socket.emit("joinChannel", {
    	name: "animach"
	});
	connected = true;
};

function onDisconn(reason) {
	console_out(color(`[DISCONNECTED]`, styles.err));
	login = '';
};

function onUserlist(data) {
	userlist = data;
	for (let i = 0; i < userlist.length; i++) {
		if (users.indexOf(userlist[i].name) == -1) users.push(userlist[i].name);
	}
}

function onUcount(data) {
	ucount = data;
}

function onUsrJoin(data) {
	if (data.name != '') {
		userlist.push(data);
		users.push(data.name);
	}
};

function onUsrLeave(data) {
	let idx = getUserIndex(data.name, userlist);
	if (idx !== -1) {
		delete userlist[idx];
		delete users[idx];
	};
};

function onMsg(data) {
	handleMsg(data);
};

function onErr(data) {
	console_out(color("[ERR] " + data, styles.err));
};

function onLogin(data) {
	if(data.success === true) {
		login = data.name;
		console_out(color(`[Welcome there, ${login}!]`, styles.ok));
	} else {
		console_out(color(`[ERR]: Login failed! ${data.error}`, styles.err));
	}
};

function printUlist(data) {
	if (data.length > 0) {
		console_out(`[${ucount}] Userlist:\n --------------------------`);
		for (let i = 0; i < data.length; i++) {
			if (data[i] !== undefined) data[i].meta.afk === true ? console_out(`| [afk][${ranks[data[i].rank]}] ${data[i].name}`) : console_out(`| [${ranks[data[i].rank]}] ${data[i].name}`);
		};
		console_out(' --------------------------');
	} else {
		console_out('Userlist is empty!');
	} 
};

function handleCmd(cmd, arg) {
	switch (cmd) {
		case 'exit':
			socket.emit('disconnect', {});
			process.exit();
			break;
		case 'ulist':
			printUlist(userlist);
			break;
		case 'login':
			if (login.length > 1) {
				console_out(`[You are logged in as a guest already, ${login}!]`);
			} else {
				guestLogin(arg);
			}
			break;
		case 'afk':
			sendText('/afk');
			break;
		case 'skip':
			socket.emit('voteskip');
			rl.prompt(true);
			break;
		case 'disconnect':
			socket.disconnect();
			rl.prompt(true);
			break;
		case 'connect':
			socket.connect();
			rl.prompt(true);
			break;
		case 'reconnect':
			socket.disconnect();
			let r = setTimeout(() => {socket.connect()}, 1000);
			break;
		case 'help':
			help();
			break;
		case 'test':
			console_out('Arg: '+ arg);
			break;
		default:
			console_out('[Command not found]')
			rl.prompt(true);
			break;
	}
};

function help() {
	console_out(color(` -------------------------------------\nHelp for Teh Chat (${ver}) by Pirate505\n -------------------------------------\nSite: github.com/Pirate505/teh_chat/ | tehtube.tv\n ========================\nAvailable commands: \n/help\n/exit\n/connect\n/disconnect\n/reconnect\n/ulist\n/login <your_login>\n/afk\n/skip\n ========================\nPress Tab to see all online users\n -------------------------------------`, styles.poll));
}

function sendText(text) {
    socket.emit('chatMsg', {
        msg: text,
        meta: {}
    });
    rl.prompt(true);
};

function guestLogin(l) {
	if (l.length > 1) {
		socket.emit("login", {name: l});
	} else {
		rl.question("Enter login (leave blank for readonly): ", (_login) => {
			if (_login != '') {
				socket.emit("login", {name: _login});
			}
			rl.prompt(true);
		});
	}
};


socket.on('connect', onConn);
socket.on('disconnect', onDisconn);
socket.on('chatMsg', onMsg);
socket.on('userlist', onUserlist);
socket.on('usercount', onUcount);
socket.on('userLeave', onUsrLeave);
socket.on('newPoll', onPollOpen);
socket.on('updatePoll', onPollUpd);
socket.on('closePoll', onPollClose);
socket.on('setAFK', onAfk);
socket.on('addUser', onUsrJoin)
socket.on('error', onErr);
socket.on('login', onLogin);

	guestLogin('');
	rl.on('line', (line) => {
		if (line[0] == '/' && line.length > 1) {
			var cmd = line.match(/[a-z]+\b/)[0];
        	var arg = line.substr(cmd.length+2, line.length);
        	handleCmd(cmd, arg);
		} else {
			sendText(line); 
			rl.prompt(true);
		}
	});

