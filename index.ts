import { inspect } from 'util'

import express from 'express'
import k8s from '@kubernetes/client-node'
import bodyParser from 'body-parser'
import { Constants } from './constants'

const app = express()
app.use(bodyParser.urlencoded({ extended: false }))

app.post('/', (req, res) => {
    const pvcName = req.get(Constants.PVC_NAME_KEY)
    const repoFullName = req.get(Constants.REPO_FULL_NAME_KEY)
    if (!pvcName || !repoFullName) {
        res.statusCode = Constants.BAD_REQUEST_CODE
        res.end()
        return
    }
    const namespace = req.get(Constants.NAMESPACE_KEY) || 'default'

    const buf: Buffer[] = []
    req.on('data', t => buf.push(t))
    req.on('end', async () => {
        const body = JSON.parse(Buffer.concat(buf).toString())
        const fullClaimName = `${pvcName}-${repoFullName}`
        try {
            await createPersistentVolumeClaim(fullClaimName, namespace)
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

const kc = new k8s.KubeConfig()
kc.loadFromCluster()

const k8sApi = kc.makeApiClient(k8s.CoreV1Api)

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
