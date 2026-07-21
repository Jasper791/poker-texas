import { resources, AudioClip, Node, AudioSource, director, EventTarget } from 'cc';
import { LogService } from '../utils/LogService';
import { AUDIO_CONFIG, BGM_PATH } from '../config/audioConfig';

const STORAGE_KEY_SOUND_ENABLED = 'poker_sound_enabled';
const STORAGE_KEY_BGM_ENABLED = 'poker_bgm_enabled';

export class SoundManager {
    private static _instance: SoundManager = null;
    private _soundEnabled: boolean = true;
    private _bgmEnabled: boolean = true;
    private _volume: number = 1.0;
    private _bgmVolume: number = 0.5;
    private _audioContext: AudioContext = null;
    private _sounds: Map<string, AudioBuffer> = new Map();
    private _currentBgmPath: string = '';
    private _bgmSource: AudioSource = null;
    private _bgmNode: Node = null;
    private _initialized: boolean = false;
    private _pendingBgmPath: string = '';

    private constructor() {
        try {
            this._audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        } catch (e) {
            LogService.warn('SoundManager', 'Web Audio API not supported');
        }
        
        this._loadFromStorage();
        
        director.on(DirectorEvent.END, this._onSceneChange, this);
    }

    private _loadFromStorage() {
        try {
            const soundEnabledStr = localStorage.getItem(STORAGE_KEY_SOUND_ENABLED);
            const bgmEnabledStr = localStorage.getItem(STORAGE_KEY_BGM_ENABLED);
            
            if (soundEnabledStr !== null) {
                this._soundEnabled = soundEnabledStr === 'true';
            }
            
            if (bgmEnabledStr !== null) {
                this._bgmEnabled = bgmEnabledStr === 'true';
            }
            
            LogService.info('SoundManager', `Loaded from storage: soundEnabled=${this._soundEnabled}, bgmEnabled=${this._bgmEnabled}`);
        } catch (e) {
            LogService.warn('SoundManager', 'Failed to load audio settings from storage', e);
        }
    }

    private _saveToStorage() {
        try {
            localStorage.setItem(STORAGE_KEY_SOUND_ENABLED, String(this._soundEnabled));
            localStorage.setItem(STORAGE_KEY_BGM_ENABLED, String(this._bgmEnabled));
            LogService.info('SoundManager', `Saved to storage: soundEnabled=${this._soundEnabled}, bgmEnabled=${this._bgmEnabled}`);
        } catch (e) {
            LogService.warn('SoundManager', 'Failed to save audio settings to storage', e);
        }
    }

    static getInstance(): SoundManager {
        if (SoundManager._instance === null) {
            SoundManager._instance = new SoundManager();
        }
        return SoundManager._instance;
    }

    private _onSceneChange() {
        this.stopBgm();
        this._bgmSource = null;
        this._bgmNode = null;
        
        if (this._pendingBgmPath) {
            setTimeout(() => {
                this.playBgm(this._pendingBgmPath);
            }, 100);
        }
    }

    setSoundEnabled(enabled: boolean) {
        this._soundEnabled = enabled;
        this._saveToStorage();
    }

    isSoundEnabled(): boolean {
        return this._soundEnabled;
    }

    setBgmEnabled(enabled: boolean) {
        this._bgmEnabled = enabled;
        this._saveToStorage();
        if (this._bgmSource) {
            this._bgmSource.volume = enabled ? this._bgmVolume : 0;
            if (enabled && !this._bgmSource.playing) {
                this._bgmSource.play();
            } else if (!enabled && this._bgmSource.playing) {
                this._bgmSource.pause();
            }
        }
    }

    isBgmEnabled(): boolean {
        return this._bgmEnabled;
    }

    setVolume(volume: number) {
        this._volume = Math.max(0, Math.min(1, volume));
    }

    getVolume(): number {
        return this._volume;
    }

    setBgmVolume(volume: number) {
        this._bgmVolume = Math.max(0, Math.min(1, volume));
        if (this._bgmSource && this._bgmEnabled) {
            this._bgmSource.volume = this._bgmVolume;
        }
    }

    getBgmVolume(): number {
        return this._bgmVolume;
    }

    play(soundName: string) {
        if (!this._soundEnabled) {
            return;
        }

        const audioPath = AUDIO_CONFIG.sfx[soundName];
        if (audioPath && audioPath !== '') {
            resources.load(audioPath, AudioClip, (err: any, clip: AudioClip) => {
                if (err) {
                    LogService.warn('SoundManager', `Failed to load audio: ${audioPath}`, err);
                    return;
                }
                const audioSource = new AudioSource();
                audioSource.clip = clip;
                audioSource.volume = this._volume;
                audioSource.play();
            });
            return;
        }

        if (this._audioContext && this._sounds.has(soundName)) {
            this.playBuffer(this._sounds.get(soundName));
            return;
        }

        if (this._audioContext) {
            this.playGeneratedSound(soundName);
        }
    }

    private playBuffer(buffer: AudioBuffer) {
        if (!this._audioContext) return;

        const source = this._audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this._audioContext.destination);
        source.start(0);
    }

    private playGeneratedSound(soundName: string) {
        if (!this._audioContext) return;

        const oscillator = this._audioContext.createOscillator();
        const gainNode = this._audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this._audioContext.destination);

        switch (soundName) {
            case 'chip':
                oscillator.frequency.value = 500;
                oscillator.type = 'square';
                gainNode.gain.value = this._volume * 0.1;
                break;
            case 'deal':
                oscillator.frequency.value = 800;
                oscillator.type = 'sine';
                gainNode.gain.value = this._volume * 0.2;
                break;
            case 'win':
                oscillator.frequency.value = 1000;
                oscillator.type = 'triangle';
                gainNode.gain.value = this._volume * 0.3;
                break;
            case 'fold':
                oscillator.frequency.value = 200;
                oscillator.type = 'sawtooth';
                gainNode.gain.value = this._volume * 0.1;
                break;
            case 'bet':
                oscillator.frequency.value = 600;
                oscillator.type = 'square';
                gainNode.gain.value = this._volume * 0.15;
                break;
            default:
                oscillator.frequency.value = 440;
                oscillator.type = 'sine';
                gainNode.gain.value = this._volume * 0.1;
                break;
        }

        oscillator.start(0);

        setTimeout(() => {
            oscillator.stop();
        }, 1000);
    }

    playDeal() {
        this.play('deal');
    }

    playChip() {
        this.play('chip');
    }

    playWin() {
        this.play('win');
    }

    playFold() {
        this.play('fold');
    }

    playBet() {
        this.play('bet');
    }

    playCall() {
        this.play('chip');
    }

    playRaise() {
        this.play('bet');
    }

    playAllIn() {
        this.play('win');
    }

    playCheck() {
        this.play('chip');
    }

    playActionSound(actionType: string) {
        const action = actionType.toLowerCase();
        switch (action) {
            case 'fold':
                this.playActionEffect('fold');
                break;
            case 'check':
                this.playActionEffect('check');
                break;
            case 'call':
                this.playActionEffect('call');
                break;
            case 'raise':
                this.playActionEffect('raise');
                break;
            case 'bet':
                this.playActionEffect('bet');
                break;
            case 'all-in':
            case 'allin':
            case 'all_in':
                this.playActionEffect('allIn');
                break;
            default:
                LogService.warn('SoundManager', `Unknown action type: ${actionType}`);
                break;
        }
    }

    private playActionEffect(actionKey: string) {
        if (!this._soundEnabled) {
            return;
        }

        const audioPath = AUDIO_CONFIG.sfx[actionKey];
        if (!audioPath || audioPath === '') {
            LogService.warn('SoundManager', `No audio config for action: ${actionKey}`);
            return;
        }

        resources.load(audioPath, AudioClip, (err: any, clip: AudioClip) => {
            if (err) {
                LogService.error('SoundManager', `Failed to load action audio: ${audioPath}`, err);
                return;
            }

            const audioSource = new AudioSource();
            audioSource.clip = clip;
            audioSource.volume = this._volume;
            audioSource.play();
        });
    }

    playHandPatternSound(handPatternKey: string) {
        if (!this._soundEnabled) {
            return;
        }
        
        const handPatternPath = AUDIO_CONFIG.handPattern[handPatternKey];
        if (!handPatternPath || handPatternPath === '') {
            LogService.warn('SoundManager', `No audio config for hand pattern: ${handPatternKey}`);
            return;
        }

        resources.load(handPatternPath, AudioClip, (err: any, clip: AudioClip) => {
            if (err) {
                LogService.error('SoundManager', `Failed to load hand pattern audio: ${handPatternPath}`, err);
                return;
            }

            const audioSource = new AudioSource();
            audioSource.clip = clip;
            audioSource.volume = this._volume;
            audioSource.play();
        });
    }

    private _playerGender: string = 'male';

    setPlayerGender(gender: string) {
        this._playerGender = gender === 'female' ? 'female' : 'male';
    }

    getPlayerGender(): string {
        return this._playerGender;
    }

    playQuickMsg(msgKey: string) {
        if (!this._soundEnabled) {
            return;
        }
        
        if (!msgKey || msgKey === '') {
            LogService.warn('SoundManager', 'Empty message key for quick message');
            return;
        }

        const audioPath = AUDIO_CONFIG.gameMsg[msgKey];

        if (!audioPath || audioPath === '') {
            LogService.warn('SoundManager', `No audio config for quick message: ${msgKey}`);
            return;
        }

        resources.load(audioPath, AudioClip, (err: any, clip: AudioClip) => {
            if (err) {
                LogService.error('SoundManager', `Failed to load quick message audio: ${audioPath}`, err);
                return;
            }
            const audioSource = new AudioSource();
            audioSource.clip = clip;
            audioSource.volume = this._volume;
            audioSource.play();
        });
    }

    playBgm(bgmPath: string) {
        if (!this._bgmEnabled) {
            this._currentBgmPath = bgmPath;
            return;
        }

        if (this._currentBgmPath === bgmPath && this._bgmSource && this._bgmSource.playing) {
            return;
        }

        this.stopBgm();
        this._pendingBgmPath = bgmPath;

        resources.load(bgmPath, AudioClip, (err: any, clip: AudioClip) => {
            if (err) {
                LogService.error('SoundManager', `Failed to load BGM: ${bgmPath}`, err);
                this._pendingBgmPath = '';
                return;
            }

            this._currentBgmPath = bgmPath;
            this._pendingBgmPath = '';
            
            this._createBgmNode();
            
            if (this._bgmSource) {
                this._bgmSource.clip = clip;
                this._bgmSource.loop = true;
                this._bgmSource.volume = this._bgmVolume;
                this._bgmSource.play();
                
                LogService.info('SoundManager', `BGM started: ${bgmPath}`);
            }
        });
    }

    private _createBgmNode() {
        if (this._bgmNode) {
            this._bgmNode.destroy();
        }
        
        const currentScene = director.getScene();
        if (!currentScene) {
            LogService.warn('SoundManager', 'Cannot create BGM node: no active scene');
            return;
        }

        this._bgmNode = new Node('BGM');
        this._bgmSource = this._bgmNode.addComponent(AudioSource);
        currentScene.addChild(this._bgmNode);
    }

    playClubBgm() {
        this.playBgm(BGM_PATH.CLUB);
    }

    playBgmByScene(sceneName: string) {
        const bgmPath = AUDIO_CONFIG.bgm[sceneName];
        if (bgmPath) {
            this.playBgm(bgmPath);
        }
    }

    stopBgm() {
        if (this._bgmSource) {
            try {
                this._bgmSource.stop();
            } catch (e) {
                LogService.warn('SoundManager', 'Error stopping BGM', e);
            }
            LogService.info('SoundManager', `BGM stopped: ${this._currentBgmPath}`);
        }
        if (this._bgmNode) {
            try {
                this._bgmNode.destroy();
            } catch (e) {
                LogService.warn('SoundManager', 'Error destroying BGM node', e);
            }
            this._bgmNode = null;
        }
        this._bgmSource = null;
        this._currentBgmPath = '';
    }

    pauseBgm() {
        if (this._bgmSource && this._bgmSource.playing) {
            this._bgmSource.pause();
        }
    }

    resumeBgm() {
        if (this._bgmSource && this._bgmEnabled && !this._bgmSource.playing) {
            this._bgmSource.play();
        }
    }

    resume() {
        if (this._audioContext && this._audioContext.state === 'suspended') {
            this._audioContext.resume();
        }
        this.resumeBgm();
    }
}

enum DirectorEvent {
    END = 'end-scene'
}
