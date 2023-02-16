
import GPUMonitor from './GPUMonitor.class'
import ping from 'ping'

(async function() {

    await GPUMonitor.setup()
    await GPUMonitor.startMonitoring({
        checkInterval: 3,
        graphLength: 10,
        gpuUseAvg: 40,
        gpuTempAvg: 53,
        memUseAvg: 30,
    })

    let timer: NodeJS.Timer

    GPUMonitor.on('throttle', () => {
        console.log(`${new Date().toISOString()} Started throttling`)
        timer = setInterval(() => {
            ping.promise.probe('localhost');
        })
    })

    GPUMonitor.on('release', () => {
        console.log(`${new Date().toISOString()} Stopped throttling`)
        clearInterval(timer)
    })
    

})()