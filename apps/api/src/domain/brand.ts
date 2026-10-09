declare const brand: unique symbol;

/**
 * A nominal type: `Brand<string, 'ChatId'>` is a string the compiler will not
 * confuse with a `UserId` or with raw input. Brands are minted only by the
 * constructor or parser that sits next to the type.
 */
export type Brand<T, Name extends string> = T & { readonly [brand]: Name };
