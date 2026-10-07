import App from '../App'
import { CloudGate } from './CloudGate'

export default function CloudApp({ userId }: { userId: string }) {
  return <CloudGate userId={userId}><App /></CloudGate>
}