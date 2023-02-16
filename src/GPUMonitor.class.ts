
import { EventEmitter } from "events";
import { getDeviceInfo } from "./NvidiaSmiInterface";

interface GPULoadHistory {
    utilizationGpu: number[]
    temperatureGpu: number[]
    memoryUsed: number[]
}

interface MonitorConfig {
    checkInterval: number
    graphLength: number
    // Triggers if any of the below thresholds are passed.
    gpuUseAvg: number
    gpuTempAvg: number
    memUseAvg: number
}


// NOTE: GPUMonitor does not expect hotswappable GPUs
// meaning no support for thunderbolt or PCIe hot-swap (Yes. PCIe can be hotswappable)
// Static multiple GPUs are supported though.

export default new class GPUMonitor  extends EventEmitter {

    constructor() { super() }

    public gpus: Record<string, GPULoadHistory> = {}
    public throttling = false
    public declare monitorIntervalID: NodeJS.Timer


    private _getAvg(arr: number[]) {
        return arr.reduce((a, b) => a + b, 0) / arr.length
    }

    /**
     * Prepares a list of all NVIDIA GPUs in the system to then start 
     * monitoring their usage and take apropriate action.
     */
    public async setup() {

        (await getDeviceInfo()).forEach(gpu => {

            const gpuID = `SUB_${gpu.subDeviceId}-PCI_${gpu.pciBus}`

            this.gpus[gpuID] = {
                utilizationGpu: [],
                temperatureGpu: [],
                memoryUsed: []
            }

            console.log(`Added GPU "${gpuID}" (${gpu.name})`)

        })

    }

    public async startMonitoring(config: MonitorConfig) {

        console.log(`Graph length: ${config.graphLength} | Intervals: ${config.checkInterval}s | GPU usage: ${config.gpuUseAvg}% | GPU temp: ${config.gpuTempAvg}% | Memory: ${config.memUseAvg}%`)

        const performChecks = async () => {

            const gpus = await getDeviceInfo()

            for (let i = 0; i < gpus.length; i++) {

                const gpu = gpus[i]
                const graphs = this.gpus[`SUB_${gpu.subDeviceId}-PCI_${gpu.pciBus}`]

                // Add to graphs
                graphs.utilizationGpu.unshift(gpu.utilizationGpu)
                graphs.temperatureGpu.unshift(gpu.temperatureGpu)
                graphs.memoryUsed.unshift((gpu.memoryUsed / gpu.memoryTotal) * 100)

                // Remove old values
                if (graphs.utilizationGpu.length > config.graphLength) graphs.utilizationGpu.pop()
                if (graphs.temperatureGpu.length > config.graphLength) graphs.temperatureGpu.pop()
                if (graphs.memoryUsed.length > config.graphLength)     graphs.memoryUsed.pop()

                // Calculate averages
                const throttleGPU  = this._getAvg(graphs.utilizationGpu) > config.memUseAvg
                const throttleTemp = this._getAvg(graphs.temperatureGpu) > config.gpuTempAvg
                const throttleMem  = this._getAvg(graphs.memoryUsed)     > config.memUseAvg

                // Initialize throttling

                // Start throttling
                if ((throttleGPU || throttleTemp || throttleMem) && !this.throttling) {
                    this.emit('throttle')
                    this.throttling = true
                }
                // Stop throttling
                if (!throttleGPU && !throttleTemp && !throttleMem && this.throttling) {
                    this.emit('release')
                    this.throttling = false
                }
                
            }

        }

        this.monitorIntervalID = setInterval(() => performChecks(), config.checkInterval * 1000)

    }

}
