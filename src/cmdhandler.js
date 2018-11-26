const EventEmitter = require('events');
const discordjs = require('discord.js');
const HelpCmd = require('./helpcmd');
const consts = require('./const');
const Command = require('./command');
const logger = require('./logger').logger;


module.exports = class CmdHandler extends EventEmitter {

    ///// PUBLICS /////

    /**
     * Create instance of Cmdhandler.
     * @param {Object}  client                    discord.js client instance
     * @param {Object}  options                   Options for the CommandHandler
     * @param {string}  options.prefix            Default prefix to access bot. This prefix is ALWAYS ACTIVE and will
     *                                            not be overwritten by guild prefixes.
     * @param {number}  [options.defaultColor]    Default color used for output message embeds
     * @param {boolean} [options.logToConsole]    Wether log command executions to console or not (default: true)
     * @param {boolean} [options.verboseLog]      Enabel or disable verbose logging (default: false)  
     * @param {boolean} [options.invokeToLower]   Wether invoke should be always lowercased or not (default: true)
     * @param {boolean} [options.parseMsgEdit]    Wether or not the command parser should interprete edited messages
     *                                            as command executions or not (default: true)
     * @param {boolean} [options.parseDM]         Wether or not the bot should parse commands in DMs generally (default: false) 
     */
    constructor(client, options) {
        super();
        if (!client) {
            throw Error('Client undefined or not initialized');
        }
        if (!options) {
            throw Error('options undefined');
        }
        if (!options.prefix) {
            throw Error('options.prefix not defined');
        }

        this.client = client;

        this.registeredCommands = {};
        this.registeredCommandInstancesSingle = [];
        this.guildPrefixes = {};

        this.prefix = options.prefix;
        this.logToConsole = options.logToConsole ? options.logToConsole : true;
        this.verboseLog = options.verboseLog ? options.verboseLog : false;
        this.invokeToLower = options.invokeToLower ? options.invokeToLower : true;
        this.parseMsgEdit = options.parseMsgEdit ? options.parseMsgEdit : true;
        this.parseDM = options.parseDM ? options.parseDM : false;
        if (options.defaultColor) {
            consts.COLORS.DEFAULT = options.defaultColor;
        }

        this._defaultHelpCmdInstance = new HelpCmd();

        client.on('ready', () => {
            this._registerMessageHandler();
        });
    }

    /**
     * Register a command Class.
     * @param {Object} CommandClass Class of the Command (not an instance!)
     * @param {string} [commandGroup] Commands group (defaultly 'MISC') 
     * @returns {Object} this
     */
    registerCommand(CommandClass, commandGroup) {
        if (CommandClass.prototype instanceof Command) {
            var commandInstance = new CommandClass();
            commandInstance
                ._setClient(this.client)
                ._setGroup(commandGroup ? commandGroup.toUpperCase() : CmdHandler.DEFAULT_GROUPS.MISC);
            if (Array.isArray(commandInstance.invokes)) {
                commandInstance.invokes.forEach((invoke) => {
                    this.registeredCommands[invoke] = commandInstance;
                })
            } else {
                this.registeredCommands[commandInstance.invokes] = commandInstance;
            }
            this.registeredCommandInstancesSingle.push(commandInstance);
        } else {
            throw Error('Class needs to extend Command class to be registered as command');
        }
        return this;
    }

    ///// PUBLIC STATICS /////

    /**
     * Default command groups enum.
     */
    static get DEFAULT_GROUPS() {
        return {
            MISC:       'MISC',
            ADMIN:      'ADMIN',
            MODERATIVE: 'MODERATIVE',
            FUN:        'FUN',
            CHAT:       'CHAT',
            GAMES:      'GAMES',
            INFO:       'INFO'
        };
    }

    ///// PRIVATES /////

    _registerMessageHandler() {
        this.client.on('message', (message) => {
            this._parseCommand(message)
        });
        if (this.parseMsgEdit) {
            this.client.on('messageUpdate', (_, newMessage) => {
               this. _parseCommand(newMessage);
            });
        }
        logger.info(`Registered ${this.registeredCommandInstancesSingle.length} commands`);
    }

    _assembleCommandArgsPayload(message, args) {
        return {
            channel:    message.channel,
            member:     message.member,
            guild:      message.member ? message.member.guild : null,
            message:    message,
            args:       args,
            cmdhandler: this,
        };
    }

    _parseCommand(message) {
        if (!message || message.author == this.client.user || message.author.bot) {
            return;
        }
        if (message.channel.type == 'dm' && !this.parseDM) {
            return;
        }

        let member = message.member || message.author;
        let guild = message.member ? message.member.guild : null;

        let _cont = message.content;
        let _prefix = this.guildPrefixes[(guild ? guild.id : '')] || this.prefix;

        if (!_cont.startsWith(_prefix)) {
            return;
        }

        let invoke = _cont
            .split(/\s+/g)[0]
            .substr(_prefix.length);

        if (this.invokeToLower) {
            invoke = invoke.toLowerCase();
        }
        
        let args = _cont
            .split(/\s+/g)
            .slice(1);

        if (Object.keys(this.registeredCommands).includes(invoke)) {
            let cmdArgs = this._assembleCommandArgsPayload(message, args);
            let cmdinstance = this.registeredCommands[invoke];
            new Promise((resolve, reject) => {
                cmdinstance.exec(cmdArgs);
                resolve();
            }).then(() => {
                if (this.logToConsole) {
                    logger.info(`<CMD EXEC> {${message.author.tag}@${message.member ? message.member.guild.name : 'DM'}} ${message.content}`);
                }
            }).catch((err) => {
                if (this.logToConsole) {
                    logger.error(`<CMD FAILED> {${message.author.tag}@${message.member ? message.member.guild.name : 'DM'}} ${message.content}`);
                }
                try {
                    cmdinstance.error(err, cmdArgs);
                } catch (err) {
                    logger.error(`|${cmdinstance.mainInvoke}| failed executing commands error() function`);
                }
            });
        } else if (invoke == 'help') {
            let cmdArgs = this._assembleCommandArgsPayload(message, args);
            new Promise((resolve, reject) => {
                this._defaultHelpCmdInstance.exec(cmdArgs);
                resolve();
            }).then(() => {
                if (this.logToConsole) {
                    logger.info(`<CMD EXEC> {${message.author.tag}@${message.member ? message.member.guild.name : 'DM'}} ${message.content}`);
                }
            });
        }
    }
}