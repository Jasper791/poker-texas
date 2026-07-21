export interface AudioConfig {
    bgm: BgmConfig;
    sfx: SfxConfig;
    handPattern: HandPatternConfig;
    gameMsg: GameMsgConfig;
}

export interface BgmConfig {
    [sceneName: string]: string;
}

export interface SfxConfig {
    [soundName: string]: string;
}

export interface HandPatternConfig {
    [patternName: string]: string;
}

export interface GameMsgConfig {
    [msgId: string]: string;
}

export const AUDIO_CONFIG: AudioConfig = {
    bgm: {
        scene_pvp: 'audio/BGMusic_Club_',
        scene_pve: 'audio/BGMusic_Club_',
        room: '',
        index: '',
        record: '',
        me: '',
        card: ''
    },
    sfx: {
        deal: '',
        chip: '',
        win: '',
        fold: 'audio/action/flod',
        bet: 'audio/action/call',
        call: 'audio/action/call',
        raise: 'audio/action/raise',
        allIn: 'audio/action/allin',
        check: 'audio/action/check',
        buttonClick: 'audio/ButtonClicked_0_',
        winPanel: 'audio/Win',
        lost: 'audio/Lost',
        start: 'audio/audio/start'
    },
    handPattern: {
        highCard: 'audio/hand_pattern/high_card',
        pair: 'audio/hand_pattern/a_pair',
        twoPairs: 'audio/hand_pattern/two_pairs',
        threeOfAKind: 'audio/hand_pattern/3_items',
        straight: 'audio/hand_pattern/straight',
        flush: 'audio/hand_pattern/flush',
        fullHouse: 'audio/hand_pattern/calabash',
        fourOfAKind: 'audio/hand_pattern/4_items',
        straightFlush: 'audio/hand_pattern/straight_flush',
        royalFlush: 'audio/hand_pattern/royal_flush'
    },
    gameMsg: {
        areYouReady: 'audio/audio/are_you_ready',
        areYourCardsGood: 'audio/audio/are_your_cards_good',
        everyTimeAllin: 'audio/audio/every_time_allin',
        iWantGo: 'audio/audio/i_want_go',
        ok: 'audio/audio/ok',
        operateQuickly: 'audio/audio/operate_quickly',
        reprepare: 'audio/audio/reprepare',
        hurryUp: 'audio/audio/QuickMsg_1000_',
        disconnected: 'audio/audio/QuickMsg_1001_',
        dontLeave: 'audio/audio/QuickMsg_1002_',
        goodCards: 'audio/audio/QuickMsg_1003_',
        genderAsk: 'audio/audio/QuickMsg_1004_',
        niceCooperation: 'audio/audio/QuickMsg_1005_',
        sorryLeave: 'audio/audio/QuickMsg_1006_',
        keepQuiet: 'audio/audio/QuickMsg_1007_'
    }
};

export const BGM_PATH = {
    CLUB: 'audio/BGMusic_Club_'
};

export const HAND_PATTERN_LABELS: Record<string, string> = {
    highCard: '高牌',
    pair: '一对',
    twoPairs: '两对',
    threeOfAKind: '三条',
    straight: '顺子',
    flush: '同花',
    fullHouse: '葫芦',
    fourOfAKind: '四条',
    straightFlush: '同花顺',
    royalFlush: '皇家同花顺'
};

export const GAME_MSG_LABELS: Record<string, string> = {
    areYouReady: '等到花都谢了，准备好了吗?',
    areYourCardsGood: '你手牌很好吗?',
    everyTimeAllin: '动不动就Allin',
    iWantGo: '我不玩了！',
    ok: '可以了！',
    operateQuickly: '快点操作！',
    reprepare: '请重新点击取消或准备！',
    hurryUp: '快点吧，等的我花都谢了！',
    disconnected: '怎么又断线了，网络怎么这么差啊!',
    dontLeave: '不要走，决战到天亮啊!',
    goodCards: '你的牌打得也太好了!',
    genderAsk: '你是妹妹还是哥哥啊?',
    niceCooperation: '和你合作真是太愉快了!',
    sorryLeave: '各位，真不好意思，我得离开一会儿。',
    keepQuiet: '不要吵了，专心玩游戏吧!'
};