import { useParams } from 'react-router-dom'
import PlateMapWidget from './PlateMapWidget'

export default function PlateMapEditor() {
  const { id } = useParams<{ id: string }>()
  if (!id) return <p className="text-red-600">No plate map ID in URL.</p>
  return <PlateMapWidget plateId={id} maxWidth={1100} />
}
