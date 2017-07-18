"use strict"

const socket = require('socket.io-client')('https://tehtube.tv:8443');
const readline = require('readline');
const color = require("ansi-color").set;
const fs = require('fs');
const ver = '0.4';

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
                              
--------------------------------------------------------\nType "/help" for list of commands\n--------------------------------------------------------`;
const start = new Date().toString().slice(4, 21).replace(/ /g, '-').replace(/:/g, '-');
const conf_fname = 'teh_config.json';
var login = '',
	connected = false,
	userlist = {},
	ucount = 0,
	ranks = {0: 'GST', 1: 'USR', 1.5: 'LDR', 2: 'MOD', 3: 'ADM', 4: 'ADM', 10: 'OWN', 255: 'SA'},
	currentPoll = {poll: {}, closed: false},
	pollHistory = [],
	styles = {highlight: 'black+white_bg', poll: 'bold', err: 'red+bold', pm: 'yellow+bold', ok: 'green+bold'},
	users = [],
	conf = {polls: 'compact', log: true, remember: true, pollfix: true},
	fname = 'tehlog-'+start+'.txt',
	pass = '';

var callbacks = {'connect': onConn, 'disconnect': onDisconn, 'chatMsg': onMsg, 'userlist': onUserlist, 'usercount': onUcount, 'userLeave': onUsrLeave, 'addUser': onUsrJoin, 'newPoll': onPollOpen, 'updatePoll': onPollUpd, 'closePoll': onPollClose, 'setAFK': onAfk, 'error': onErr, 'login': onLogin, 'pm': onPm, 'errorMsg': onErrMsg};
var helpstr = ` -------------------------------------\nHelp for Teh Chat (v${ver}) by Pirate505\n -------------------------------------\nSite: github.com/Pirate505/teh_chat/ | tehtube.tv\n ========================\nAvailable commands: \n/help -- show this text\n/exit -- exit the client\n/connect -- connect to the server socket\n/disconnect -- disconnect, lol\n/reconnect -- reconnect?\n/ulist -- show usercount and userlist\n/config [JSON object] -- some configuration, see details below\n/login [your_login] [password] -- log in as a guest or user (if u have registred account) \n/logout - log out from your account\n/pm <user> <message> -- send private message to the user\n/vote <number_of_option> -- vote for something in current poll\n/afk -- afk\n/skip -- vote to skip current video\n ========================\nPress Tab to see all online users, type "/config" without params to check current config.\nConfig format: {"property1":"val1", "property2":42}\nCurrent config: ${JSON.stringify(conf)}\nProperties: \n "polls": "full|compact|none" - "full" by default (must be a string!)\n "log": true|false - enable/disable logging into file\n "remember": true|false - remember your login and password for this session\n "pollfix": true|false - enable/disable all poll updates print\n -------------------------------------`;

function completer(line) {
  let completions = users;
  let hits = completions.filter((c) => c.startsWith(line));
  return [hits.length ? hits : completions, line];
};

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
    !conf.log || logWrite(msg);
    rl.prompt(true);
};

function configWrite(fname, cnf) {
	let c = JSON.stringify(cnf);
	fs.writeFile(conf_fname, c, 'utf8', (err) => {if (err) console_out(color('[FS_ERR] Config write failed!', styles.err));});
};

function configRead(fname) {
	let data = '';
	try {
		fs.accessSync(fname, fs.constants.F_OK | fs.constants.R_OK | fs.constants.W_OK);
	} catch(e) {
		console_out('[Can\'t access config file! Creating new one]');
		fs.writeFileSync(fname, JSON.stringify(conf), 'utf8', (err) => {if (err) console_out(color('[FS_ERR] Config write failed!]', styles.err));});
  	}
  	data = fs.readFileSync(fname, 'utf8');
	return data;
};

function configInit(fname) {
	let tmp = configRead(fname);
	if (tmp.length > 0) {
		applyConfig(tmp);
	}
};

function applyConfig(cnf) {
	try {
		let tmpc = JSON.parse(cnf.trim());
		for (let k in tmpc) {
			conf[k] = tmpc[k];
		}
	} catch(e) {
		console_out(color(`[ERR] ${e.name}: ${e.message}`), styles.err)
	}
};

function logWrite(str) {
	let tmp = str.replace(/\033\[[0-9]{1,2}m/g, '')+'\n';
	fs.appendFile(fname, tmp, 'utf8', (err) => {if (err) {console_out(color(`[FS_ERR] ${err}`, styles.err));}});
};

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
};

function getTimestamp(time) {
	let timestamp = new Date(time).toTimeString().split(" ")[0];
	return timestamp;
};

function handleMsg(data) {
	let timestamp = getTimestamp(data.time);
	let msg = formatMsg(data.msg);
	if (msg.indexOf(login) != -1 && login != '') {msg = color(msg, styles.highlight);}
	console_out(`>> [${timestamp}] ${data.username}: ${msg}`);
};

function handlePm(data) {
	let timestamp = getTimestamp(data.time),
		msg = formatMsg(data.msg);
	console_out(color(`[${timestamp}] ${data.username}->${data.to}: ${msg}`, styles.pm));
};

function getUserIndex(name, list) {
	if (list.length > 0) {
		for (let i = 0; i < list.length; i++) {
			if (list[i] !== undefined && list[i].name == name) return i;
		}
	} 
	return -1;
};

function onAfk(data) {
	let idx = getUserIndex(data.name, userlist);
	if (idx != -1) userlist[idx].meta.afk = data.afk;
};

function printPoll(poll, state) {
	let timestamp = state == 'new' ? getTimestamp(poll.timestamp) : new Date().toTimeString().split(" ")[0];
	if (conf.polls == 'full' || conf.polls == 'compact') {
		switch (state) {
			case 'new':
				console_out(color(`>> (At ${timestamp}) ${poll.initiator} STARTED NEW POLL: ${formatMsg(poll.title)}`, styles.poll));
			 	if (conf.polls == 'full' && poll.options.length > 0) {
			 		for (let i = 0; i < poll.options.length; i++) {
			 			let opt = formatMsg(poll.options[i]);
			 			let m = i == poll.options.length-1 ? `   ╚ [${i}] ${opt}: ${poll.counts[i]}` : `   ╠ [${i}] ${opt}: ${poll.counts[i]}`
			 			console_out(color(m, styles.poll));
			 		}
			 	}
				break;
			case 'upd':
				console_out(color(`>> [${timestamp}] POLL UPDATE: ${formatMsg(poll.title)}`, styles.poll));
				if (conf.polls == 'full' && poll.options.length > 0) {
			 		for (let i = 0; i < poll.options.length; i++) {
			 			let opt = formatMsg(poll.options[i]);
			 			let m = i == poll.options.length-1 ? `   ╚ [${i}] ${opt}: ${poll.counts[i]}` : `   ╠ [${i}] ${opt}: ${poll.counts[i]}`
			 			console_out(color(m, styles.poll));
			 		}
			 	}
				break;
			case 'close':
				console_out(color(`>> [${timestamp}] [POLL CLOSED]`, styles.poll));
				break;
		}
	}
};

function onPollOpen(data) {
	currentPoll.poll = data;
	currentPoll.closed = false;
	printPoll(currentPoll.poll, 'new');
};

function isArrEqual(a, b, strict) {
	strict = strict || false;
	if (a.length != b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if(strict) {
			if(a[i] !== b[i]) return false;
		}
		if(a[i] != b[i]) return false;
	}
	return true;
};

function onPollUpd(data) {
	let eq = isArrEqual(currentPoll.poll.counts, data.counts);
	if (eq && conf.pollfix) {
		currentPoll.poll = data;
	} else {
		currentPoll.poll = data;
		printPoll(currentPoll.poll, 'upd');
	} 
};

function onPollClose(data) {
	currentPoll.closed = true;
	pollHistory.push(currentPoll)
	currentPoll = {};
	printPoll(pollHistory[pollHistory.length-1].poll, 'close');
};

function onErrMsg(data) {
	console_out(color(`[ERR]: ${data.msg}`, styles.err))
};

function onConn() {
	console_out(color("[CONNECTED]", styles.ok));
	socket.emit("joinChannel", {
    	name: "animach"
	});
	connected = true;
	if (conf.remember && login.length > 1 && pass.length > 1) {
		socket.emit('login', {name: login, pw: new Buffer(pass, 'base64').toString('utf8')});
	}

};

function onDisconn(reason) {
	console_out(color(`[DISCONNECTED]`, styles.err));
	if (conf.remember == false || pass.length < 2) login = '';
};

function onUserlist(data) {
	userlist = data;
	for (let i = 0; i < userlist.length; i++) {
		if (users.indexOf(userlist[i].name) == -1) users.push(userlist[i].name);
	}
};

function onUcount(data) {
	ucount = data;
};

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

function onPm(data) {
	handlePm(data);
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
			if (data[i] !== undefined) data[i].meta.afk === true ? console_out(`| [afk][${ranks[data[i].rank]}] ${data[i].name}`) : console_out(`|      [${ranks[data[i].rank]}] ${data[i].name}`);
		};
		console_out(' --------------------------');
	} else {
		console_out('Userlist is empty!');
	} 
};

function sockReconnect(time) {
	socket.disconnect();
	let r = setTimeout(() => {socket.connect()}, time);
}

function handleCmd(cmd, arg) {
	switch (cmd) {
		case 'exit':
			socket.disconnect();
			process.exit();
			break;
		case 'ulist':
			printUlist(userlist);
			break;
		case 'login':
			if (login.length > 1) {
				console_out(`[You are logged in already, ${login}!]`);
			} else {
				sockLogin(arg);
			}
			break;
		case 'logout':
			login = '';
			pass = '';
			sockReconnect(500);
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
			sockReconnect(1000);
			break;
		case 'help':
			help();
			break;
		case 'pm':
			if(arg.length > 2) {
				let tmp = arg.trim(),
					sp = tmp.indexOf(' '),
					to = tmp.slice(0, sp),
					msg = tmp.slice(sp+1).trim();
				socket.emit('pm', {to: to, msg: msg});
			} else {
				console_out(color('Invalid params!', styles.err))
			}
			break;
		case 'vote':
			if(arg.length > 0) {
				socket.emit('vote', {option: +arg});
			}
			rl.prompt(true);
			break;
		case 'config':
			if (arg.length > 1) {
				applyConfig(arg);
				configWrite(conf_fname, conf);
				rl.prompt(true);
			} else {
				console_out('Current config: '+JSON.stringify(conf));
			}

			break;
		default:
			console_out('[Command not found]')
			rl.prompt(true);
			break;
	}
};

function help() {
	console_out(color(helpstr, styles.poll));
};

function sendText(text) {
    socket.emit('chatMsg', {
        msg: text,
        meta: {}
    });
    rl.prompt(true);
};

function sockLogin(logpass) {
	if (logpass.length > 1) {
		logpass = logpass.trim().split(" ");
		if(logpass.length < 2) {
			socket.emit("login", {name: logpass[0]});
		} else {
			socket.emit("login", {name: logpass[0], pw: logpass[1]});
			if (conf.remember) pass = new Buffer(logpass[1]).toString('base64');
		}
	} else {
		rl.question("Enter login or login and password (leave blank for readonly): ", (_logpass) => {
			if (_logpass.length > 1) {
				_logpass = _logpass.trim().split(" ");
				if (_logpass.length < 2) {
					socket.emit("login", {name: _logpass[0]});
				} else {
					socket.emit("login", {name: _logpass[0], pw: _logpass[1]});
					if (conf.remember) pass = new Buffer(_logpass[1]).toString('base64');
				}
			}
			rl.prompt(true);
		});
	}
};

function initCallbacks(cb) {
	for (let k in cb) {
		socket.on(k.toString(), cb[k]);
	}
};

configInit(conf_fname);

console_out(logo);

initCallbacks(callbacks);

sockLogin('');

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


