import { redirect } from 'next/navigation';

export default function LoginVerifyRedirect() {
  redirect('/verify');
}
