import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { KJUR } from 'jsrsasign'
import { inNumberArray, isBetween, isRequiredAllOrNone, validateRequest } from './validations.js'

dotenv.config()

// Validate required environment variables
if (!process.env.ZOOM_MEETING_SDK_KEY || !process.env.ZOOM_MEETING_SDK_SECRET) {
  console.error('Error: ZOOM_MEETING_SDK_KEY and ZOOM_MEETING_SDK_SECRET must be set in environment variables')
  process.exit(1)
}

const app = express()
const port = process.env.PORT || 4000

app.use(express.json(), cors())
app.options('*', cors())

const propValidations = {
  role: inNumberArray([0, 1]),
  expirationSeconds: isBetween(1800, 172800),
  videoWebRtcMode: inNumberArray([0, 1])
}

const schemaValidations = [isRequiredAllOrNone(['meetingNumber', 'role'])]

const coerceRequestBody = (body) => ({
  ...body,
  ...['role', 'expirationSeconds', 'videoWebRtcMode'].reduce(
    (acc, cur) => ({ ...acc, [cur]: typeof body[cur] === 'string' ? parseInt(body[cur]) : body[cur] }),
    {}
  )
})

app.post('/', (req, res) => {
  const requestBody = coerceRequestBody(req.body)
  const validationErrors = validateRequest(requestBody, propValidations, schemaValidations)

  if (validationErrors.length > 0) {
    return res.status(400).json({ errors: validationErrors })
  }

  const { meetingNumber, role, expirationSeconds, videoWebRtcMode } = requestBody
  const iat = Math.floor(Date.now() / 1000)
  const exp = expirationSeconds ? iat + expirationSeconds : iat + 60 * 60 * 2
  const oHeader = { alg: 'HS256', typ: 'JWT' }

  const oPayload = {
    appKey: process.env.ZOOM_MEETING_SDK_KEY,
    sdkKey: process.env.ZOOM_MEETING_SDK_KEY,
    mn: meetingNumber,
    role,
    iat,
    exp,
    tokenExp: exp,
    video_webrtc_mode: videoWebRtcMode
  }

  const sHeader = JSON.stringify(oHeader)
  const sPayload = JSON.stringify(oPayload)

  try {
    const sdkJWT = KJUR.jws.JWS.sign('HS256', sHeader, sPayload, process.env.ZOOM_MEETING_SDK_SECRET)
    return res.json({ signature: sdkJWT, sdkKey: process.env.ZOOM_MEETING_SDK_KEY })
  } catch (error) {
    console.error('JWT signing error:', error.message)
    return res.status(500).json({ error: 'Failed to generate JWT token' })
  }
})

app.listen(port, () => console.log(`Zoom Meeting SDK Auth Endpoint Sample Node.js, listening on port ${port}!`))
