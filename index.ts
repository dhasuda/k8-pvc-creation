import { inspect } from 'util'

import express from 'express'
import { CoreV1Api, KubeConfig } from '@kubernetes/client-node'
import bodyParser from 'body-parser'
import { Constants } from './constants'

const app = express()
app.use(bodyParser.urlencoded({ extended: false }))

app.post('/', (req, res) => {
    const pvcName = req.get(Constants.PVC_NAME_KEY)
    if (!pvcName) {
        res.statusCode = Constants.BAD_REQUEST_CODE
        res.end()
        return
    }
    const namespace = req.get(Constants.NAMESPACE_KEY) || 'default'

    const buf: Buffer[] = []
    req.on('data', t => buf.push(t))
    req.on('end', async () => {
        const body = JSON.parse(Buffer.concat(buf).toString())
        const repoName = body.repository?.name
        const ownerName = body.repository?.owner?.login
        if (!repoName || !ownerName) {
            res.statusCode = Constants.BAD_REQUEST_CODE
            res.end()
            return
        }
        const fullClaimName = `${pvcName}-${ownerName}-${repoName}`
        try {
            try {
                await createPersistentVolumeClaim(fullClaimName, namespace)
            } catch (e) {
                if (e.statusCode !== 409) {
                    throw e
                }
            }
            const result = {
                ...body,
                [pvcName]: fullClaimName
            }
            res.statusCode = 200
            for (const key in req.headers) {
                res.set(key, req.get(key))
            }
            res.end(JSON.stringify(result))
        } catch (err) {
            console.log('GENERIC ERROR: 500', inspect(err))
            res.statusCode = 500
            res.end(inspect(err))
        }
    })
})

app.delete('/', async (req, res) => {
    res.statusCode = 200
    try {
        k8sApi.deleteNamespacedPersistentVolumeClaim(req.body.name, req.body.namespace || 'default')
        res.statusCode = 200
        res.end()
    } catch (err) {
        res.statusCode = 500
        res.end(inspect(err))
    }
})

app.listen(Constants.PORT)

const kc = new KubeConfig()
kc.loadFromCluster()

const k8sApi = kc.makeApiClient(CoreV1Api)

const createPersistentVolumeClaim = async (name: string, namespace: string) => {
    return k8sApi.createNamespacedPersistentVolumeClaim(namespace,
        {
            apiVersion: 'v1',
            kind: 'PersistentVolumeClaim',
            metadata: {
                name,
                namespace,
            },
            spec: {
                volumeMode: 'Filesystem',
                storageClassName: 'ssd-retained',
                resources: {
                    requests: {
                        storage: '50Gi',
                    },
                },
                accessModes: ['ReadWriteOnce'],
            }
        }
    )
}
