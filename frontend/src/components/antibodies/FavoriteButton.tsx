interface FavoriteButtonProps {
  isFavorite: boolean
  onClick: () => void
}

export default function FavoriteButton({ isFavorite, onClick }: FavoriteButtonProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="text-lg leading-none hover:scale-110 transition-transform"
      title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
    >
      {isFavorite ? (
        <span className="text-yellow-400">&#9733;</span>
      ) : (
        <span className="text-gray-300 dark:text-gray-600 hover:text-yellow-400">&#9734;</span>
      )}
    </button>
  )
}
