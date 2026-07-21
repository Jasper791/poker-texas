import { LogService } from './LogService';

/**
 * 测试结果状态
 */
export enum TestStatus {
    PENDING = 'pending',
    RUNNING = 'running',
    PASSED = 'passed',
    FAILED = 'failed',
    SKIPPED = 'skipped'
}

/**
 * 单个测试结果
 */
export interface TestResult {
    name: string;
    status: TestStatus;
    duration?: number;
    error?: string;
}

/**
 * 测试套件结果
 */
export interface TestSuiteResult {
    name: string;
    tests: TestResult[];
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
}

/**
 * 测试回调
 */
export type TestFunction = () => void | Promise<void>;

/**
 * 钩子回调
 */
export type HookFunction = () => void | Promise<void>;

/**
 * 测试框架
 * 轻量级的单元测试框架
 */
export class TestRunner {
    private static _instance: TestRunner | null = null;

    private _suites: Map<string, {
        tests: Array<{ name: string, fn: TestFunction }>;
        beforeAll?: HookFunction;
        afterAll?: HookFunction;
        beforeEach?: HookFunction;
        afterEach?: HookFunction;
    }> = new Map();

    private _results: TestSuiteResult[] = [];
    private _currentSuite: string | null = null;

    /**
     * 获取单例
     */
    static getInstance(): TestRunner {
        if (!TestRunner._instance) {
            TestRunner._instance = new TestRunner();
        }
        return TestRunner._instance;
    }

    /**
     * 私有构造函数
     */
    private constructor() {
    }

    /**
     * 定义测试套件
     */
    describe(name: string, fn: () => void): void {
        this._currentSuite = name;
        this._suites.set(name, { tests: [] });

        try {
            fn();
        } finally {
            this._currentSuite = null;
        }
    }

    /**
     * 定义单个测试
     */
    it(name: string, fn: TestFunction): void {
        if (!this._currentSuite) {
            LogService.warn('TestRunner', 'Test must be inside a describe block');
            return;
        }

        const suite = this._suites.get(this._currentSuite)!;
        suite.tests.push({ name, fn });
    }

    /**
     * 在所有测试前执行
     */
    beforeAll(fn: HookFunction): void {
        if (!this._currentSuite) return;
        const suite = this._suites.get(this._currentSuite)!;
        suite.beforeAll = fn;
    }

    /**
     * 在所有测试后执行
     */
    afterAll(fn: HookFunction): void {
        if (!this._currentSuite) return;
        const suite = this._suites.get(this._currentSuite)!;
        suite.afterAll = fn;
    }

    /**
     * 在每个测试前执行
     */
    beforeEach(fn: HookFunction): void {
        if (!this._currentSuite) return;
        const suite = this._suites.get(this._currentSuite)!;
        suite.beforeEach = fn;
    }

    /**
     * 在每个测试后执行
     */
    afterEach(fn: HookFunction): void {
        if (!this._currentSuite) return;
        const suite = this._suites.get(this._currentSuite)!;
        suite.afterEach = fn;
    }

    /**
     * 运行所有测试
     */
    async runAll(): Promise<TestSuiteResult[]> {

        this._results = [];
        const startTime = Date.now();

        for (const [name, suite] of this._suites.entries()) {
            const result = await this._runSuite(name, suite);
            this._results.push(result);
        }

        const totalDuration = Date.now() - startTime;
        this._printSummary(totalDuration);

        return this._results;
    }

    /**
     * 运行指定测试套件
     */
    async runSuite(suiteName: string): Promise<TestSuiteResult | null> {
        const suite = this._suites.get(suiteName);
        if (!suite) {
            LogService.warn('TestRunner', `Suite '${suiteName}' not found`);
            return null;
        }

        return await this._runSuite(suiteName, suite);
    }

    /**
     * 获取测试结果
     */
    getResults(): TestSuiteResult[] {
        return [...this._results];
    }

    /**
     * 断言相等
     */
    expectEqual<T>(actual: T, expected: T, message?: string): void {
        if (actual !== expected) {
            throw new Error(message || `Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}`);
        }
    }

    /**
     * 断言真值
     */
    expectTrue(value: any, message?: string): void {
        if (!value) {
            throw new Error(message || `Expected truthy value, but got ${value}`);
        }
    }

    /**
     * 断言假值
     */
    expectFalse(value: any, message?: string): void {
        if (value) {
            throw new Error(message || `Expected falsy value, but got ${value}`);
        }
    }

    /**
     * 断言抛出错误
     */
    expectThrows(fn: () => void, message?: string): void {
        let threw = false;
        try {
            fn();
        } catch (e) {
            threw = true;
        }
        if (!threw) {
            throw new Error(message || 'Expected function to throw');
        }
    }

    // ==================== 私有方法 ====================

    /**
     * 运行单个测试套件
     */
    private async _runSuite(name: string, suite: any): Promise<TestSuiteResult> {
        const result: TestSuiteResult = {
            name,
            tests: [],
            passed: 0,
            failed: 0,
            skipped: 0,
            duration: 0
        };

        const suiteStartTime = Date.now();

        LogService.info('TestRunner', `\n--- Running Suite: ${name} ---`);

        // beforeAll
        if (suite.beforeAll) {
            try {
                await suite.beforeAll();
            } catch (e) {
                LogService.error('TestRunner', `beforeAll failed: ${e}`);
            }
        }

        // 运行测试
        for (const test of suite.tests) {
            const testResult = await this._runTest(test, suite);
            result.tests.push(testResult);

            switch (testResult.status) {
                case TestStatus.PASSED:
                    result.passed++;
                    break;
                case TestStatus.FAILED:
                    result.failed++;
                    break;
                case TestStatus.SKIPPED:
                    result.skipped++;
                    break;
            }
        }

        // afterAll
        if (suite.afterAll) {
            try {
                await suite.afterAll();
            } catch (e) {
                LogService.error('TestRunner', `afterAll failed: ${e}`);
            }
        }

        result.duration = Date.now() - suiteStartTime;

        LogService.info('TestRunner',
            `Suite '${name}' completed: ${result.passed} passed, ${result.failed} failed, ${result.skipped} skipped (${result.duration}ms)`
        );

        return result;
    }

    /**
     * 运行单个测试
     */
    private async _runTest(test: any, suite: any): Promise<TestResult> {
        const result: TestResult = {
            name: test.name,
            status: TestStatus.PENDING
        };

        const testStartTime = Date.now();

        try {
            result.status = TestStatus.RUNNING;

            // beforeEach
            if (suite.beforeEach) {
                await suite.beforeEach();
            }

            // 运行测试
            await test.fn();

            // afterEach
            if (suite.afterEach) {
                await suite.afterEach();
            }

            result.status = TestStatus.PASSED;
            LogService.info('TestRunner', `  ✓ ${test.name}`);
        } catch (e) {
            result.status = TestStatus.FAILED;
            result.error = e instanceof Error ? e.message : String(e);
            LogService.error('TestRunner', `  ✗ ${test.name}: ${result.error}`);
        } finally {
            result.duration = Date.now() - testStartTime;
        }

        return result;
    }

    /**
     * 打印测试摘要
     */
    private _printSummary(totalDuration: number): void {
        let totalPassed = 0;
        let totalFailed = 0;
        let totalSkipped = 0;

        for (const result of this._results) {
            totalPassed += result.passed;
            totalFailed += result.failed;
            totalSkipped += result.skipped;
        }
        LogService.info('TestRunner', `Total: ${totalPassed + totalFailed + totalSkipped}`);
        LogService.info('TestRunner', `Passed: ${totalPassed}`);
        LogService.info('TestRunner', `Failed: ${totalFailed}`);
        LogService.info('TestRunner', `Skipped: ${totalSkipped}`);
        LogService.info('TestRunner', `Duration: ${totalDuration}ms`);
    }
}

// ==================== 便捷导出 ====================

const testRunner = TestRunner.getInstance();

export const describe = testRunner.describe.bind(testRunner);
export const it = testRunner.it.bind(testRunner);
export const beforeAll = testRunner.beforeAll.bind(testRunner);
export const afterAll = testRunner.afterAll.bind(testRunner);
export const beforeEach = testRunner.beforeEach.bind(testRunner);
export const afterEach = testRunner.afterEach.bind(testRunner);
export const expectEqual = testRunner.expectEqual.bind(testRunner);
export const expectTrue = testRunner.expectTrue.bind(testRunner);
export const expectFalse = testRunner.expectFalse.bind(testRunner);
export const expectThrows = testRunner.expectThrows.bind(testRunner);
export const runAllTests = testRunner.runAll.bind(testRunner);
export const runTestSuite = testRunner.runSuite.bind(testRunner);
