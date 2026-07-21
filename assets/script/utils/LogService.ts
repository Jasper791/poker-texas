/**
 * 日志服务 - 符合国际规范的标准化日志格式
 * 
 * 标准格式:
 * {
 *   "timestamp": "2024-01-15T10:30:00.000Z",
 *   "level": "INFO",
 *   "module": "ModuleName",
 *   "message": "log message",
 *   "data": {...}  // 可选的附加数据
 * }
 */

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

// 服务标识信息（用于国际规范）
const SERVICE_NAME = 'TexasPoker';
const SERVICE_VERSION = '1.0.0';

export class LogService {
    private static currentLevel: LogLevel = LogLevel.INFO;
    private static enableLog: boolean = true;
    private static useStructuredFormat: boolean = false;  // 是否使用结构化JSON格式
    
    /**
     * 初始化日志服务
     * @param level 日志级别
     * @param enable 是否启用日志
     * @param structured 是否使用结构化JSON格式（默认false，用于国际化标准兼容）
     */
    static init(level: LogLevel = LogLevel.DEBUG, enable: boolean = true, structured: boolean = false): void {
        this.currentLevel = level;
        this.enableLog = enable;
        this.useStructuredFormat = structured;
    }
    
    /**
     * 获取ISO 8601格式的时间戳
     */
    private static getTimestamp(): string {
        return new Date().toISOString();
    }
    
    /**
     * 获取日志级别名称
     */
    private static getLevelName(level: LogLevel): string {
        switch (level) {
            case LogLevel.DEBUG: return 'DEBUG';
            case LogLevel.INFO: return 'INFO';
            case LogLevel.WARN: return 'WARN';
            case LogLevel.ERROR: return 'ERROR';
            default: return 'UNKNOWN';
        }
    }
    
    /**
     * 格式化日志消息
     */
    private static formatMessage(level: LogLevel, tag: string, message: string, data?: any): string {
        if (this.useStructuredFormat) {
            // 结构化JSON格式（符合国际规范）
            const logEntry = {
                timestamp: this.getTimestamp(),
                level: this.getLevelName(level),
                module: tag,
                service: SERVICE_NAME,
                version: SERVICE_VERSION,
                message: message
            };
            if (data !== undefined) {
                logEntry['data'] = data;
            }
            return JSON.stringify(logEntry);
        } else {
            // 友好格式（便于调试）
            return `[${this.getTimestamp()}] [${this.getLevelName(level)}] [${tag}] ${message}${data !== undefined ? ' ' + JSON.stringify(data) : ''}`;
        }
    }
    
    static debug(tag: string, ...args: any[]): void {
        if (!this.enableLog || this.currentLevel > LogLevel.DEBUG) return;
        const message = this.formatMessage(LogLevel.DEBUG, tag, args[0] || '', args.slice(1));
        console.debug(message);
    }
    
    static info(tag: string, ...args: any[]): void {
        if (!this.enableLog || this.currentLevel > LogLevel.INFO) return;
        const message = this.formatMessage(LogLevel.INFO, tag, args[0] || '', args.slice(1));
        console.info(message);
    }
    
    static warn(tag: string, ...args: any[]): void {
        if (!this.enableLog || this.currentLevel > LogLevel.WARN) return;
        const message = this.formatMessage(LogLevel.WARN, tag, args[0] || '', args.slice(1));
        console.warn(message);
    }
    
    static error(tag: string, ...args: any[]): void {
        if (!this.enableLog || this.currentLevel > LogLevel.ERROR) return;
        const message = this.formatMessage(LogLevel.ERROR, tag, args[0] || '', args.slice(1));
        console.error(message);
    }
    
    /**
     * 设置日志级别
     */
    static setLevel(level: LogLevel): void {
        this.currentLevel = level;
    }
    
    /**
     * 设置是否使用结构化格式
     */
    static setStructuredFormat(structured: boolean): void {
        this.useStructuredFormat = structured;
    }
    
    /**
     * 启用/禁用日志
     */
    static setEnable(enable: boolean): void {
        this.enableLog = enable;
    }
}
