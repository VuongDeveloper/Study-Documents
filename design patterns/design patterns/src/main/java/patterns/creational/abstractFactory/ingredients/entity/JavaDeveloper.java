package patterns.creational.abstractFactory.ingredients.entity;

public class JavaDeveloper implements Developer{
    @Override
    public void getLanguage() {
        System.out.println("Java");
    }
}
