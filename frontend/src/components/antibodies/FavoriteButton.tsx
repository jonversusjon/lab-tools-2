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
        /* theme-exempt: star/favorite semantic color */
        <span className="text-yellow-400">&#9733;</span>
      ) : (
        /* theme-exempt: favorite star hover color */
        <span className="text-foreground-subtle hover:text-yellow-400">&#9734;</span>
      )}
    </button>
  )
}
