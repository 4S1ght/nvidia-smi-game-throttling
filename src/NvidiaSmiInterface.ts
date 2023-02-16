
import path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';

const _platform = process.platform;
const _windows = _platform === 'win32';
const _linux = _platform === 'linux';
const _baseWinPath = process.env.WINDIR || 'C:\\Windows';

let _smi: string;

const execOptsWin = {
    windowsHide: true,
    maxBuffer: 1024 * 20000,
    encoding: 'UTF-8',
    env: Object.assign({}, process.env, { LANG: 'en_US.UTF-8' })
}

const smiOptions = [
    '--query-gpu=driver_version',
    'pci.sub_device_id',
    'name',
    'pci.bus_id',
    'fan.speed',
    'memory.total',
    'memory.used',
    'memory.free',
    'utilization.gpu',
    'utilization.memory',
    'temperature.gpu',
    'temperature.memory',
    'power.draw',
    'power.limit',
    'clocks.gr',
    'clocks.mem --format=csv',
    'noheader',
    'nounits'
].join(',');

// getNvidiaSmi implementation based on v5 of systeminformation NPM package
// https://systeminformation.io
// https://github.com/sebhildebrandt/systeminformation/blob/v5/lib/graphics.js#L378

// This package was created for realtime NVIDIA GPU monitoring
// which was not efficiently implemented by the systeminformation v5.x.x module. 
// Original package spawned over 10 short-lived processes to check attached displays
// which caused memory usage spikes by up to 300MB along with CPU overhead when allocating memory.
// These processes were also executed in sync with the main node process, which is known to be a bad practice.
// - +40% CPU usage spikes on a Ryzen 7 3700X
// - +70-80% spikes on an Intel I5-7500

function getNvidiaSmi() {

    if (_smi) return _smi;

    // Linux
    if (_linux) _smi = 'nvidia-smi';

    // Windows
    else if (_windows) {
        try {
            const basePath = path.join(_baseWinPath, '\\System32\\DriverStore\\FileRepository');

            // List all directories with nvidia-smi.exe inside
            const possibleDirs = fs.readdirSync(basePath).filter((dir) => fs.readdirSync([basePath, dir].join('/')).includes('nvidia-smi.exe'));

            const targetDir = possibleDirs.reduce((previousDir, currentDir) => {
                let prevSmiFile =    fs.statSync([basePath, previousDir, 'nvidia-smi.exe'].join('/'));
                let currentSmiFile = fs.statSync([basePath, currentDir, 'nvidia-smi.exe'].join('/'));
                return (prevSmiFile.ctimeMs > currentSmiFile.ctimeMs) ? previousDir : currentDir;
            });

            if (targetDir) _smi = path.join(basePath, targetDir, 'nvidia-smi.exe');

        } 
        catch (err) {
            return undefined;
        }
    }

    return _smi;
}

// Calls Nvidia-SMI and returns string output
const getNvidiaSmiOutput = (options?: {[key: string]: any}|null) => new Promise <string|null> (async (resolve) => {
    try {
        const nvidiaSmiExe = getNvidiaSmi();
        options = options || execOptsWin;

        if (nvidiaSmiExe) {
            const cmd = nvidiaSmiExe + ' ' + smiOptions + (_linux ? '  2>/dev/null' : '');

            exec(cmd, options, (error, stdout, stderr) => {
                if (stderr || error) resolve(null);
                else resolve(stdout);
            });
        }
        else resolve(null);
    } 
    catch (err) {
        resolve(null);
    }
});

interface GPUInfo {
    driverVersion:      string,
    subDeviceId:        string,
    name:               string,
    pciBus:             string,
    fanSpeed:           number,
    memoryTotal:        number,
    memoryUsed:         number,
    memoryFree:         number,
    utilizationGpu:     number,
    utilizationMemory:  number,
    temperatureGpu:     number,
    temperatureMemory:  number,
    powerDraw:          number,
    powerLimit:         number,
    clockCore:          number,
    clockMemory:        number
}

export const getDeviceInfo = () => new Promise<GPUInfo[]>(async (resolve) => {
    try {

        // Prevents errors from parsing null/undefined
        const _parseFloat = (value: any) => {
            if ([undefined, null].includes(value)) return null;
            return parseFloat(value); 
        }

        const smiOutput = await getNvidiaSmiOutput();

        if (!smiOutput) resolve([]);

        else {
            const gpus = smiOutput.split('\n').filter(Boolean);
            const results = gpus.map(gpu => {
                const data = gpu.split(', ').map(value => value.includes('N/A') ? undefined : value);
                if (data.length === 16) {
                    return {
                        driverVersion:      data[0],
                        subDeviceId:        data[1],
                        name:               data[2],
                        pciBus:             data[3],
                        fanSpeed:           _parseFloat(data[4]),
                        memoryTotal:        _parseFloat(data[5]),
                        memoryUsed:         _parseFloat(data[6]),
                        memoryFree:         _parseFloat(data[7]),
                        utilizationGpu:     _parseFloat(data[8]),
                        utilizationMemory:  _parseFloat(data[9]),
                        temperatureGpu:     _parseFloat(data[10]),
                        temperatureMemory:  _parseFloat(data[11]),
                        powerDraw:          _parseFloat(data[12]),
                        powerLimit:         _parseFloat(data[13]),
                        clockCore:          _parseFloat(data[14]),
                        clockMemory:        _parseFloat(data[15]),
                    }
                }
            });

            // @ts-ignore
            resolve(results)
        }
        
    } 
    catch (err) {
        resolve([])
    }
});
