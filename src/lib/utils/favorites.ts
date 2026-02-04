export const onlyFavorites = <T extends { isFavorite?: boolean }>(foods: T[]) =>
	foods.filter((food) => food.isFavorite);
