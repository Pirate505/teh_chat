"use strict"

const socket = require('socket.io-client')('https://tehtube.tv:8443', {transportOptions: {polling: {extraHeaders: {'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3'}}}});
const readline = require('readline');
const color = require("ansi-color").set;
const fs = require('fs');
const ver = '0.9';
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
                                            (v${ver})
--------------------------------------------------------\nType "/help" for list of commands\n--------------------------------------------------------`;

const conf_fname = 'teh_config.json';
var login = '',
	connected = false,
	userlist = [],
	ucount = 0,
	ranks = {0: 'GST', 1: 'USR', 1.5: 'LDR', 2: 'MOD', 3: 'ADM', 4: 'ADM', 10: 'OWN', 255: 'SA'},
	currentPoll = {poll: {}, closed: true},
	pollHistory = [],
	styles = {highlight: 'black+white_bg', poll: 'bold', err: 'red+bold', pm: 'yellow+bold', ok: 'green+bold', usrlog: 'yellow'},
	users = [],
	media = {},
	conf = {polls: 'compact', log: true, remember: true, pollfix: true, usrlog: true, usrlogwrite: false, cmdlog: false},
	start_date = new Date(),
	log_date = start_date.toString().slice(4, 15).replace(/ /g, '-').replace(/:/g, '-'),
	log_name = 'tehlog-'+log_date+'.txt',
	pass = '';

var callbacks = {'connect': onConn, 'disconnect': onDisconn, 'chatMsg': onMsg, 'userlist': onUserlist, 'usercount': onUcount, 'userLeave': onUsrLeave, 'addUser': onUsrJoin, 'newPoll': onPollOpen, 'updatePoll': onPollUpd, 'closePoll': onPollClose, 'setAFK': onAfk, 'error': onErr, 'login': onLogin, 'pm': onPm, 'errorMsg': onErrMsg, 'changeMedia': onChMedia, 'setUserRank': onChRank};
var helpstr = ` -------------------------------------\nHelp for Teh Chat (v${ver}) by Pirate505\n -------------------------------------\nSite: github.com/Pirate505/teh_chat/ | tehtube.tv\n ========================\nAvailable commands: \n/help -- show this text\n/exit -- exit the client\n/now -- shows, whats playing right now, its duration and source type\n/connect -- connect to the server socket\n/disconnect -- disconnect, lol\n/reconnect [delay] -- reconnect?\n/ulist -- show usercount and userlist\n/config [JSON object] -- some configuration, see details below\n/login [your_login] [password] -- log in as a guest or user (if u have registred account) \n/logout - log out from your account\n/pm <user> <message> -- send private message to the user\n/lastpoll -- prints last opened poll \n/vote <number_of_option> -- vote for something in current poll\n/afk -- afk\n/skip -- vote to skip current video\n ========================\nPress Tab to see all online users, type "/config" without params to check current config.\nConfig format: {"property1":"val1", "property2":42}\nDefault config: ${JSON.stringify(conf)}\nProperties: \n "polls": "full|compact|none" - polls display style, "compact" by default (must be a string!)\n "log": true|false - enable/disable logging into file\n "remember": true|false - remember your login and password for this session\n "pollfix": true|false - enable/disable all poll updates print\n "usrlog": true|false - enable/disable user join and leave messages\n "usrlogwrite": true|false - write user join/leave messages to the log\n "cmdlog": true|false - write commands output to the log\n -------------------------------------`;

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

function console_out(msg, log_write = true) {
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    console.log(msg);
    !conf.log || !log_write || logWrite(msg);
    rl.prompt(true);
};

function deleteByVal(arr, elem) {
	if (arr.indexOf(elem) !== -1) {
		return arr.slice(0,arr.indexOf(elem)).concat(arr.slice(arr.indexOf(elem)+1));
	} else {
		return arr;
	}
}

function configWrite(fname, cnf) {
	let c = JSON.stringify(cnf);
	fs.writeFile(fname, c, 'utf8', (err) => {if (err) console_out(color('[FS_ERR] Config write failed!', styles.err));});
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
	let now = new Date();
	if (now.getDate() !== start_date.getDate()) {
		log_date = now.toString().slice(4, 15).replace(/ /g, '-').replace(/:/g, '-');
		log_name = 'tehlog-'+log_date+'.txt';
	}
	let tmp = (str + '').replace(/\033\[[0-9]{1,2}m/g, '').replace(/^\>\>/, '')+'\n';
	fs.appendFile(log_name, tmp, 'utf8', (err) => {if (err) {console_out(color(`[FS_ERR] ${err}`, styles.err));}});
};

function formatMsg(msg) {
	let rep = {"&#39;": "'", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#40;": "(", "&#41;": ")"};
	for (let key in rep) {
		while(msg.indexOf(key) != -1) {
			msg = msg.replace(key, rep[key]);
		}
	};
	//http[#:/\w.%\-\?=\+]* - links parse
	msg = msg.replace(/\<[/]*(span|code|a)[^>]*\>/g, '');
	while(msg.indexOf('img class="chat-picture"') != -1) {
		let start = msg.indexOf('<img'),
			src = msg.indexOf('src="')+5,
			endsrc = msg.indexOf('"', src),
			end = msg.indexOf('/>')+2;

			msg = msg.slice(0, start) + msg.slice(src, endsrc) + msg.slice(end);
	}
	return msg;
};


function getTimestamp(time = 'now') {
	if (time !== 'now') {
		return new Date(time).toTimeString().split(" ")[0];
	} else {
		return new Date().toTimeString().split(" ")[0];
	}
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
	let timestamp = state == 'new' ? getTimestamp(poll.timestamp) : getTimestamp();
	if (conf.polls == 'full' || conf.polls == 'compact') {
		let o = '';
		if (state != 'close' && poll.options.length > 0) {
			for (let i = 0; i < poll.options.length; i++) {
	 			let opt = formatMsg(poll.options[i]);
	 			o += i == poll.options.length-1 ? `   ╚ [${i}] ${opt}: ${poll.counts[i]}\n` : `   ╠ [${i}] ${opt}: ${poll.counts[i]}\n`
	 		}
		}
		switch (state) {
			case 'new':
				console_out(color(`>> (At ${timestamp}) ${poll.initiator} STARTED NEW POLL: ${formatMsg(poll.title)}`, styles.poll));
			 	if (conf.polls == 'full') console_out(color(o, styles.poll));
				break;
			case 'upd':
				console_out(color(`>> [${timestamp}] POLL UPDATE: ${formatMsg(poll.title)}`, styles.poll));
				if (conf.polls == 'full') console_out(color(o, styles.poll));
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
	currentPoll.poll = {};
	printPoll(pollHistory[pollHistory.length-1].poll, 'close');
};

function onErrMsg(data) {
	console_out(color(`[ERR]: ${data.msg}`, styles.err))
};

function onConn() {
	setTimeout(() => {
		console_out(color("[CONNECTED]", styles.ok));
		socket.emit("joinChannel", {
    		name: "animach"
		});
		connected = true;
		if (conf.remember && login.length > 1 && pass.length > 1) {
			socket.emit('login', {name: login, pw: new Buffer(pass, 'base64').toString('utf8')});
		}
	}, 300);

};

function onChMedia(data) {
	media = data;
};

function onChRank(data) {
	let idx = getUserIndex(data.name, userlist);
	if (data.name != '' && idx !== -1) {
		let oldrank = ranks[userlist[idx].rank],
			newrank = ranks[data.rank];
		userlist[idx].rank = data.rank;
		let timestamp = getTimestamp();
		!conf.usrlog || console_out(color(`[${timestamp}][${data.name}'s rank has been changed from ${oldrank} to ${newrank}']`, styles.usrlog), conf.usrlogwrite);
	}
}

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
	let idx = getUserIndex(data.name, userlist);
	if (data.name != '' && idx == -1) {
		userlist.push(data);
		users.push(data.name);
		if (conf.usrlog == true) {
			let timestamp = getTimestamp();
			console_out(color(`[${timestamp}][${data.name} has joined the channel]`, styles.usrlog), conf.usrlogwrite);
		}
	}
};

function onUsrLeave(data) {
	let idx = getUserIndex(data.name, userlist);
	if (idx != -1) {
		userlist.splice(idx, 1);
		users = deleteByVal(users, data.name);
	};
	if (conf.usrlog == true) {
		let timestamp = getTimestamp();
		console_out(color(`[${timestamp}][${data.name} has left the channel]`, styles.usrlog), conf.usrlogwrite);
	}
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
		console_out(`[${ucount}] Userlist:\n --------------------------`, conf.cmdlog);
		for (let i = 0; i < data.length; i++) {
			if (data[i] !== undefined) data[i].meta.afk === true ? console_out(`| [afk][${ranks[data[i].rank]}] ${data[i].name}`, conf.cmdlog) : console_out(`|      [${ranks[data[i].rank]}] ${data[i].name}`, conf.cmdlog);
		};
		console_out(' --------------------------', conf.cmdlog);
	} else {
		console_out('Userlist is empty!', conf.cmdlog);
	} 
};

function sendPm(arg) {
	if(arg.length > 2) {
		let tmp = arg.trim(),
			sp = tmp.indexOf(' '),
			to = tmp.slice(0, sp),
			msg = tmp.slice(sp+1).trim();
		socket.emit('pm', {to: to, msg: msg});
	} else {
		console_out(color('Invalid params!', styles.err), conf.cmdlog);
	}
}

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
				console_out(`[You are logged in already, ${login}!]`, conf.cmdlog);
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
			let delay = +arg > 10 ? +arg : 1000
			sockReconnect(delay);
			break;
		case 'help':
			help();
			break;
		case 'now':
			console_out(color(`[Now playing: "${media.title}" | ${media.duration} | ${media.type}]`, styles.poll), conf.cmdlog);
			break;
		case 'pm':
			sendPm(arg);
			rl.prompt(true);
			break;
		case 'vote':
			if(arg.length > 0) {
				socket.emit('vote', {option: +arg});
			}
			rl.prompt(true);
			break;
		case 'lastpoll':
			if(currentPoll.poll) printPoll(currentPoll.poll, 'new');
			break;
		case 'config':
			if (arg.length > 1) {
				applyConfig(arg);
				configWrite(conf_fname, conf);
				rl.prompt(true);
			} else {
				console_out('Current config: '+JSON.stringify(conf), conf.cmdlog);
			}

			break;
		default:
			console_out('[Command not found]', conf.cmdlog)
			rl.prompt(true);
			break;
	}
};

function help() {
	console_out(color(helpstr, styles.poll), conf.cmdlog);
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

applyConfig(configRead(conf_fname));

console_out(logo, conf.cmdlog);

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

