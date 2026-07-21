/**
 * 座位位置计算器
 * 负责计算玩家在桌面上的视觉位置
 */
export class SeatPositionCalculator {
    /**
     * 计算座位位置（基于椭圆方程）
     * 规则：
     * 1. 玩家入座是随机的（playerSeat可以是0-8任意一个）
     * 2. 从真实玩家的第一视角看，自己始终在下方位置
     * 3. 玩家编号是实际座位号（1-9），不是相对编号
     * 
     * @param playersNum 玩家总数
     * @param getPlayerSeat 获取真实玩家座位的回调
     * @param isPlayerActive 检查玩家是否活跃的回调
     * @param returnLocal 是否返回本地坐标
     */
    static calculateSeatPositions(
        playersNum: number,
        getPlayerSeat: () => number,
        isPlayerActive: (index: number) => boolean,
        returnLocal: boolean = true
    ): any[] {
        const positions = [];
        
        // 椭圆参数（根据实际桌面大小调整）
        const ellipseWidth = 600;  // 椭圆宽度（减小以确保所有玩家都在可视区域内）
        const ellipseHeight = 1000; // 椭圆高度（减小以确保所有玩家都在可视区域内）
        const margin = 50; // 边缘留白（增加以确保所有玩家都在可视区域内）
        
        // 真实玩家的实际座位（随机分配）
        const realPlayerSeat = getPlayerSeat();
        
        // 收集活跃玩家的实际座位
        const activeSeats = [];
        for (let i = 0; i < playersNum; i++) {
            if (isPlayerActive(i)) {
                activeSeats.push(i);
            }
        }
        
        // 活跃玩家数量
        const activePlayersNum = activeSeats.length;
        
        // 计算每个活跃玩家的"视觉索引"
        // 视觉索引0 = 真实玩家的位置（下方）
        // 视觉索引1 = 真实玩家顺时针方向下一个座位（右边）
        // 视觉索引2 = 真实玩家顺时针方向再下一个座位
        // 依此类推，视觉索引按顺时针方向递增
        
        for (let i = 0; i < activePlayersNum; i++) {
            const actualSeat = activeSeats[i];
            const playerNumber = actualSeat + 1;
            
            // 计算这个座位相对于真实玩家的视觉位置
            let visualIndex: number;
            if (actualSeat === realPlayerSeat) {
                visualIndex = 0; // 真实玩家在视觉索引0（下方）
            } else {
                // 计算从真实玩家到当前位置在活跃玩家中的顺时针距离
                let distanceFromReal = 0;
                let currentSeat = realPlayerSeat;
                while (true) {
                    currentSeat = (currentSeat + 1) % playersNum;
                    // 只计算活跃玩家
                    if (isPlayerActive(currentSeat)) {
                        distanceFromReal++;
                    }
                    if (currentSeat === actualSeat) {
                        break;
                    }
                }
                visualIndex = distanceFromReal;
            }
            
            // 计算角度（弧度）
            // 视觉索引0（真实玩家）在下方（-π/2）
            // 其他视觉索引按顺时针方向排列
            const angleOffset = -Math.PI / 2; // 真实玩家在正下方
            const angleInterval = (Math.PI * 2) / activePlayersNum;
            // 负号表示顺时针方向（三角函数中默认是逆时针）
            const angle = angleOffset - (angleInterval * visualIndex);
            
            // 椭圆方程：x = a * cos(θ), y = b * sin(θ)
            const a = (ellipseWidth - margin * 2) / 2;
            const b = (ellipseHeight - margin * 2) / 2;
            
            const x = a * Math.cos(angle);
            const y = b * Math.sin(angle);
            
            // 计算旋转角度，使玩家面向桌子中心
            const rotation = (Math.atan2(y, x) * 180 / Math.PI) - 90;
            
            // 判断是否为真实玩家
            const isPlayer = (actualSeat === realPlayerSeat);
            
            positions.push({
                x: returnLocal ? x : x + ellipseWidth / 2,
                y: returnLocal ? y : y + ellipseHeight / 2,
                rotation: rotation,
                isPlayer: isPlayer,
                playerNumber: playerNumber,
                actualSeat: actualSeat, // 实际座位号
                visualIndex: visualIndex // 视觉索引，用于排序
            });
        }
        
        // 按视觉索引排序，确保顺时针顺序
        positions.sort((a, b) => a.visualIndex - b.visualIndex);
        
        return positions;
    }
}
