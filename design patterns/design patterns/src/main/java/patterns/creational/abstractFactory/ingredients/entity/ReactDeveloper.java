package patterns.creational.abstractFactory.ingredients.entity;

public class ReactDeveloper implements Developer{
    @Override
    public void getLanguage() {
        System.out.println("ReactJs");
    }
}
