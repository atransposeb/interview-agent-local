/** Soft color fields and paper grain behind a page. Purely decorative. */
export function Backdrop() {
    return (
        <>
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden print:hidden">
                <div className="absolute -left-40 -top-40 size-[34rem] rounded-full bg-sage/25 blur-3xl" />
                <div className="absolute -right-32 top-24 size-[28rem] rounded-full bg-butter blur-3xl" />
                <div className="absolute -left-24 top-[48rem] size-[26rem] rounded-full bg-mist blur-3xl" />
                <div className="absolute -right-20 top-[90rem] size-[30rem] rounded-full bg-blush/80 blur-3xl" />
                <div className="absolute left-1/3 top-[140rem] size-[28rem] rounded-full bg-lilac/70 blur-3xl" />
            </div>
            <div aria-hidden="true" className="bg-grain pointer-events-none fixed inset-0 z-50 opacity-[0.03] print:hidden" />
        </>
    );
}
