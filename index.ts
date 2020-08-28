import { inspect } from 'util'
import { randomBytes } from 'crypto'

import express from 'express'
import k8s from '@kubernetes/client-node'
import bodyParser from 'body-parser'

const PORT = 8080
const PVC_NAME_KEY = 'X-Pvc-Name'

const app = express()
app.use(bodyParser.urlencoded({ extended: false }))

app.post('/', (req, res) => {
    const pvcName = req.get(PVC_NAME_KEY)
    if (pvcName === undefined) {
        res.statusCode = 400
        res.end()
        return
    }
    const buf: Buffer[] = []
    req.on('data', t => buf.push(t))
    req.on('end', async () => {
        const body = JSON.parse(Buffer.concat(buf).toString())
        const secretName = `${pvcName!}-${randomBytes(8).toString('hex')}`.toLowerCase()
        try {
            const result = {
                ...body,
                [pvcName]: secretName
            }
            res.statusCode = 200
            console.log(JSON.stringify(result))
            for (const key in req.headers) {
                res.set(key, req.get(key))
                console.log('-H', key, req.get(key))
            }
            res.end(JSON.stringify(result))
        } catch (err) {
            res.statusCode = 500
            res.end(inspect(err))
        }
    })
})

app.delete('/', async (req, res) => {
    res.statusCode = 200
    try {
        await k8sApi.deleteNamespacedSecret(req.body.secret, req.body.namespace || 'default')
        res.statusCode = 200
        res.end()
    } catch (err) {
        res.statusCode = 500
        res.end(inspect(err))
    }
})

app.listen(PORT)

const kc = new k8s.KubeConfig()
kc.loadFromCluster()

const k8sApi = kc.makeApiClient(k8s.CoreV1Api)

function createSecret(name: string, namespace: string, key: string, value: string) {
    return k8sApi.createNamespacedSecret(namespace, {
        kind: 'Secret',
        apiVersion: 'v1',
        metadata: {
            name,
        },
        stringData: {
            [key]: value
        }
    })
}
