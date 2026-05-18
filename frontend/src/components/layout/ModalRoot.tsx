import { useModal } from './ModalContext'
import FpbaseFetchModal from '@/components/fluorophores/FpbaseFetchModal'

export default function ModalRoot() {
  const { request, close } = useModal()
  if (!request) return null
  switch (request.kind) {
    case 'fpbase_fetch':
      return (
        <FpbaseFetchModal
          onClose={close}
          prefillFluorophoreId={request.fluorophoreId}
        />
      )
  }
}
