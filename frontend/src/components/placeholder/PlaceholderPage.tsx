interface PlaceholderPageProps {
  title: string
  description: string
  icon: string
}

function PlaceholderPage({ title, description, icon }: PlaceholderPageProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <span className="text-5xl mb-4">{icon}</span>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">{title}</h1>
      <p className="text-gray-500 dark:text-gray-400 max-w-md">{description}</p>
      <span className="mt-4 inline-block rounded-full bg-blue-100 dark:bg-blue-900/30 px-3 py-1 text-xs font-medium text-blue-700 dark:text-blue-400">
        Coming Soon
      </span>
    </div>
  )
}

export default PlaceholderPage
