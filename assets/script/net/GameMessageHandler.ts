/**
 * 游戏消息处理器
 * 专门针对服务端协议格式优化！
 * 
 * 服务端协议格式：
 * - 4字节：大端序的长度（protobuf数据长度）
 * - 后接：标准protobuf GameMessage
 */
import { LogService } from '../utils/LogService';

export class GameMessageHandler {
    constructor() {
    }

    /**
     * 编码消息
     * @param cmd 命令类型
     * @param sequence 序列号
     * @param body 消息体（JSON对象）
     * @returns ArrayBuffer
     */
    public encodeMessage(cmd: number, sequence: number, body: any): ArrayBuffer {
        // 1. 先把 body 转成 JSON 字符串（服务端LoginHandler用JSON解析！）
        const bodyJsonStr = JSON.stringify(body);
        const bodyBytes = new TextEncoder().encode(bodyJsonStr);

        // 2. 编码 GameMessage protobuf
        const protobufBytes = this.encodeGameMessageProtobuf(cmd, sequence, Date.now(), '', bodyBytes);

        // 3. 最终格式：4字节长度 + protobuf
        const totalLength = 4 + protobufBytes.length;
        const buffer = new ArrayBuffer(totalLength);
        const view = new DataView(buffer);
        const uint8Array = new Uint8Array(buffer);

        // 写入4字节长度（大端序）
        view.setInt32(0, protobufBytes.length, false);

        // 写入 protobuf 数据
        uint8Array.set(protobufBytes, 4);

        return buffer;
    }

    /**
     * 编码 GameMessage protobuf（简化但准确的实现）
     */
    private encodeGameMessageProtobuf(
        cmd: number, 
        sequence: number, 
        timestamp: number, 
        sign: string, 
        bodyBytes: Uint8Array
    ): Uint8Array {
        const writer = new SimpleProtobufWriter();

        // Field 1: cmd (int32, wire type 0)
        if (cmd !== 0) {
            writer.writeTag(1, 0);
            writer.writeInt32(cmd);
        }

        // Field 2: sequence (int64, wire type 0)
        if (sequence !== 0) {
            writer.writeTag(2, 0);
            writer.writeInt64(sequence);
        }

        // Field 3: timestamp (int64, wire type 0)
        if (timestamp !== 0) {
            writer.writeTag(3, 0);
            writer.writeInt64(timestamp);
        }

        // Field 4: sign (string, wire type 2)
        if (sign && sign.length > 0) {
            writer.writeTag(4, 2);
            writer.writeString(sign);
        }

        // Field 5: body (bytes, wire type 2)
        if (bodyBytes && bodyBytes.length > 0) {
            writer.writeTag(5, 2);
            writer.writeBytes(bodyBytes);
        }

        return writer.getBuffer();
    }

    /**
     * 解码消息
     * @param data ArrayBuffer
     * @returns 解码后的消息
     */
    public decodeMessage(data: ArrayBuffer): any {
        try {
            const view = new DataView(data);
            const uint8Array = new Uint8Array(data);

            // 1. 读取 4字节 长度
            const protobufLength = view.getInt32(0, false);
            if (4 + protobufLength > data.byteLength) {
                return null;
            }

            // 2. 读取 protobuf 数据
            const protobufData = uint8Array.subarray(4, 4 + protobufLength);

            // 3. 解析 GameMessage
            const message = this.decodeGameMessageProtobuf(protobufData);

            return message;
        } catch (e) {
            LogService.error('GameMessageHandler', `Decode error: ${e}`);
            return null;
        }
    }

    /**
     * 解码 GameMessage protobuf
     */
    private decodeGameMessageProtobuf(data: Uint8Array): any {
        const reader = new SimpleProtobufReader(data);
        const result: any = {
            cmd: 0,
            sequence: 0,
            timestamp: 0,
            sign: '',
            body: null
        };

        while (!reader.isAtEnd()) {
            const tag = reader.readTag();
            const fieldNumber = tag.fieldNumber;
            const wireType = tag.wireType;

            switch (fieldNumber) {
                case 1: // cmd
                    if (wireType === 0) {
                        result.cmd = reader.readInt32();
                    } else {
                        reader.skipField(wireType);
                    }
                    break;
                case 2: // sequence
                    if (wireType === 0) {
                        result.sequence = reader.readInt64();
                    } else {
                        reader.skipField(wireType);
                    }
                    break;
                case 3: // timestamp
                    if (wireType === 0) {
                        result.timestamp = reader.readInt64();
                    } else {
                        reader.skipField(wireType);
                    }
                    break;
                case 4: // sign
                    if (wireType === 2) {
                        result.sign = reader.readString();
                    } else {
                        reader.skipField(wireType);
                    }
                    break;
                case 5: // body (bytes)
                    if (wireType === 2) {
                        const bodyBytes = reader.readBytes();
                        // 先尝试把 body 解析成 JSON（服务端返回的是JSON！）
                        try {
                            const bodyStr = new TextDecoder().decode(bodyBytes);
                            result.body = JSON.parse(bodyStr);
                        } catch (e) {
                            result.body = bodyBytes;
                        }
                    } else {
                        reader.skipField(wireType);
                    }
                    break;
                default:
                    reader.skipField(wireType);
                    break;
            }
        }

        return result;
    }
}

/**
 * 简单的 Protobuf 写入器
 */
class SimpleProtobufWriter {
    private buffer: number[] = [];

    writeTag(fieldNumber: number, wireType: number) {
        const tag = (fieldNumber << 3) | wireType;
        this.writeVarint(tag);
    }

    writeInt32(value: number) {
        this.writeVarint(value);
    }

    writeInt64(value: number) {
        this.writeVarint(value);
    }

    writeString(value: string) {
        const bytes = new TextEncoder().encode(value);
        this.writeVarint(bytes.length);
        this.buffer.push(...bytes);
    }

    writeBytes(bytes: Uint8Array) {
        this.writeVarint(bytes.length);
        this.buffer.push(...bytes);
    }

    private writeVarint(value: number) {
        let temp = value;
        do {
            let byte = temp & 0x7F;
            temp = temp >>> 7;
            if (temp !== 0) {
                byte |= 0x80;
            }
            this.buffer.push(byte);
        } while (temp !== 0);
    }

    getBuffer(): Uint8Array {
        return new Uint8Array(this.buffer);
    }
}

/**
 * 简单的 Protobuf 读取器
 */
class SimpleProtobufReader {
    private data: Uint8Array;
    private offset: number = 0;

    constructor(data: Uint8Array) {
        this.data = data;
    }

    isAtEnd(): boolean {
        return this.offset >= this.data.length;
    }

    readTag(): { fieldNumber: number, wireType: number } {
        const tag = this.readVarint();
        return {
            fieldNumber: tag >>> 3,
            wireType: tag & 0x7
        };
    }

    readInt32(): number {
        return this.readVarint();
    }

    readInt64(): number {
        return this.readVarint();
    }

    readString(): string {
        const length = this.readVarint();
        const bytes = this.data.subarray(this.offset, this.offset + length);
        this.offset += length;
        return new TextDecoder().decode(bytes);
    }

    readBytes(): Uint8Array {
        const length = this.readVarint();
        const bytes = this.data.subarray(this.offset, this.offset + length);
        this.offset += length;
        return bytes;
    }

    skipField(wireType: number) {
        switch (wireType) {
            case 0:
                this.readVarint();
                break;
            case 1:
                this.offset += 8;
                break;
            case 2:
                const len = this.readVarint();
                this.offset += len;
                break;
            case 3:
                while (!this.isAtEnd()) {
                    const t = this.readTag();
                    if (t.wireType === 4) break;
                    this.skipField(t.wireType);
                }
                break;
            case 4:
                break;
            case 5:
                this.offset += 4;
                break;
        }
    }

    private readVarint(): number {
        let result = 0;
        let shift = 0;
        while (this.offset < this.data.length) {
            const byte = this.data[this.offset++];
            result |= (byte & 0x7F) << shift;
            if ((byte & 0x80) === 0) {
                break;
            }
            shift += 7;
        }
        return result;
    }
}
