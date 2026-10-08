import { redirectIfAuthenticated } from '@/lib/route-guards'
import Form from './signup-form'

export default async function Page() {
  await redirectIfAuthenticated()
  return <Form />
}
